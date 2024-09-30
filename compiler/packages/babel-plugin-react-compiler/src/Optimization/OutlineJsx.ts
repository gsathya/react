/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import invariant from 'invariant';
import {Environment} from '../HIR';
import {
  BasicBlock,
  GeneratedSource,
  HIRFunction,
  IdentifierId,
  Instruction,
  InstructionKind,
  JsxAttribute,
  JsxExpression,
  LoadGlobal,
  makeBlockId,
  makeIdentifierName,
  makeInstructionId,
  makeType,
  ObjectProperty,
  Place,
  promoteTemporary,
  promoteTemporaryJsxTag,
} from '../HIR/HIR';
import {createTemporaryPlace} from '../HIR/HIRBuilder';
import {deadCodeElimination} from './DeadCodeElimination';
import {identifier} from '@babel/types';
import {printIdentifier} from '../HIR/PrintHIR';

export function outlineJSX(fn: HIRFunction): void {
  const outlinedFns: Array<HIRFunction> = [];
  outlineJsxImpl(fn, outlinedFns);

  for (const outlinedFn of outlinedFns) {
    fn.env.outlineFunction(outlinedFn, 'Component');
  }
}

type JsxInstruction = Instruction & {value: JsxExpression};
type LoadGlobalInstruction = Instruction & {value: LoadGlobal};
type LoadGlobalMap = Map<IdentifierId, LoadGlobalInstruction>;

function outlineJsxImpl(
  fn: HIRFunction,
  outlinedFns: Array<HIRFunction>,
): void {
  const globals: LoadGlobalMap = new Map();
  let shouldRunDeadCodeElimination = false;

  for (const [, block] of fn.body.blocks) {
    const newInstrs = new Map();
    let jsx: Array<JsxInstruction> = [];

    for (const instr of block.instructions) {
      const {value, lvalue} = instr;
      if (value.kind === 'LoadGlobal') {
        globals.set(lvalue.identifier.id, instr as LoadGlobalInstruction);
        continue;
      }

      if (instr.value.kind === 'JsxExpression') {
        jsx.push(instr as JsxInstruction);
        continue;
      }

      if (jsx.length !== 0) {
        debugger;
        const result = process(fn, jsx, globals);
        if (result) {
          outlinedFns.push(result.fn);
          newInstrs.set(jsx[0].id, {
            end: instr.id,
            instrs: result.instrs,
          });
        }

        jsx = [];
      }

      if (value.kind === 'FunctionExpression') {
        outlineJsxImpl(value.loweredFunc.func, outlinedFns);
      }
    }

    if (jsx.length !== 0) {
      const result = process(fn, jsx, globals);
      if (result) {
        outlinedFns.push(result.fn);
        newInstrs.set(jsx[0].id, {
          end: block.instructions.length,
          instrs: result.instrs,
        });
      }
    }

    if (newInstrs.size > 0) {
      shouldRunDeadCodeElimination = true;
      const newInstr = [];
      for (let i = 0; i < block.instructions.length; i++) {
        if (newInstrs.has(i + 1)) {
          const {end, instrs} = newInstrs.get(i + 1);
          newInstr.push(...instrs);
          i = end - 2;
        } else {
          newInstr.push(block.instructions[i]);
        }
      }
      block.instructions = newInstr;
    }
  }

  if (shouldRunDeadCodeElimination) {
    deadCodeElimination(fn);
  }
}

type OutlinedResult = {
  instrs: Array<Instruction>;
  fn: HIRFunction;
};

function process(
  fn: HIRFunction,
  jsx: Array<JsxInstruction>,
  globals: LoadGlobalMap,
): OutlinedResult | null {
  /**
   * In the future, add a check for backedge to outline jsx inside loops in a
   * top level component. For now, only outline jsx in callbacks.
   */
  if (fn.fnType === 'Component') {
    return null;
  }

  // Only outline nested jsx.
  if (jsx.length < 2) {
    return null;
  }

  const props = collectProps(jsx);
  if (!props) return null;

  const outlinedTag = fn.env.generateGloballyUniqueIdentifierName(null).value;
  const newInstrs = emitOutlinedJsx(fn.env, jsx, props, outlinedTag);
  if (!newInstrs) return null;

  const outlinedFn = emitOutlinedFn(fn.env, jsx, props, globals);
  if (!outlinedFn) return null;
  outlinedFn.id = outlinedTag;

  return {instrs: newInstrs, fn: outlinedFn};
}

function collectProps(
  instructions: Array<JsxInstruction>,
): Array<JsxAttribute> | null {
  const attributes: Array<JsxAttribute> = [];
  for (const instr of instructions) {
    const {value} = instr;

    for (const at of value.props) {
      if (at.kind === 'JsxSpreadAttribute') {
        return null;
      }

      if (at.kind === 'JsxAttribute') {
        attributes.push(at);
      }
    }
  }
  return attributes;
}

function emitOutlinedJsx(
  env: Environment,
  instructions: Array<Instruction>,
  props: Array<JsxAttribute>,
  outlinedTag: string,
): Array<Instruction> {
  const loadJsx: Instruction = {
    id: makeInstructionId(0),
    loc: GeneratedSource,
    lvalue: createTemporaryPlace(env, GeneratedSource),
    value: {
      kind: 'LoadGlobal',
      binding: {
        kind: 'ModuleLocal',
        name: outlinedTag,
      },
      loc: GeneratedSource,
    },
  };
  promoteTemporaryJsxTag(loadJsx.lvalue.identifier);
  const jsxExpr: Instruction = {
    id: makeInstructionId(0),
    loc: GeneratedSource,
    lvalue: instructions.at(-1)!.lvalue,
    value: {
      kind: 'JsxExpression',
      tag: loadJsx.lvalue,
      props,
      children: null,
      loc: GeneratedSource,
      openingLoc: GeneratedSource,
      closingLoc: GeneratedSource,
    },
  };

  return [loadJsx, jsxExpr];
}

function emitOutlinedFn(
  env: Environment,
  jsx: Array<JsxInstruction>,
  oldProps: Array<JsxAttribute>,
  globals: LoadGlobalMap,
): HIRFunction | null {
  const instructions: Array<Instruction> = [];
  const oldToNewProps = createOldToNewPropsMapping(env, oldProps);

  const propsObj: Place = createTemporaryPlace(env, GeneratedSource);
  promoteTemporary(propsObj.identifier);

  const destructurePropsInstr = emitDestructureProps(env, propsObj, [
    ...oldToNewProps.values(),
  ]);
  instructions.push(destructurePropsInstr);

  const updatedJsxInstructions = emitUpdatedJsx(jsx, oldToNewProps);
  const loadGlobalInstrs = emitLoadGlobals(jsx, globals);
  if (!loadGlobalInstrs) {
    return null;
  }
  instructions.push(...loadGlobalInstrs);
  instructions.push(...updatedJsxInstructions);

  const block: BasicBlock = {
    kind: 'block',
    id: makeBlockId(0),
    instructions,
    terminal: {
      id: makeInstructionId(0),
      kind: 'return',
      loc: GeneratedSource,
      value: instructions.at(-1)!.lvalue,
    },
    preds: new Set(),
    phis: new Set(),
  };

  const fn: HIRFunction = {
    loc: GeneratedSource,
    id: null,
    fnType: 'Other',
    env,
    params: [propsObj],
    returnTypeAnnotation: null,
    returnType: makeType(),
    context: [],
    effects: null,
    body: {
      entry: block.id,
      blocks: new Map([[block.id, block]]),
    },
    generator: false,
    async: false,
    directives: [],
  };
  return fn;
}

function emitLoadGlobals(
  jsx: Array<JsxInstruction>,
  globals: LoadGlobalMap,
): Array<Instruction> | null {
  const instructions: Array<Instruction> = [];
  for (const {value} of jsx) {
    // Add load globals instructions for jsx tags
    if (value.tag.kind === 'Identifier') {
      const loadGlobalInstr = globals.get(value.tag.identifier.id);
      if (!loadGlobalInstr) {
        return null;
      }
      instructions.push(loadGlobalInstr);
    }
  }

  return instructions;
}

function emitUpdatedJsx(
  jsx: Array<JsxInstruction>,
  oldToNewProps: Map<IdentifierId, ObjectProperty>,
): Array<JsxInstruction> {
  const newInstrs: Array<JsxInstruction> = [];

  for (const instr of jsx) {
    const {value} = instr;
    const newProps: Array<JsxAttribute> = [];
    // Update old props references to use the newly destructured props param
    for (const prop of value.props) {
      invariant(
        prop.kind === 'JsxAttribute',
        `Expected only attributes but found ${prop.kind}`,
      );
      const newProp = oldToNewProps.get(prop.place.identifier.id);
      invariant(
        newProp !== undefined,
        `Expected a new property for ${printIdentifier(prop.place.identifier)}`,
      );
      newProps.push({
        ...prop,
        place: newProp.place,
      });
    }

    newInstrs.push({
      ...instr,
      value: {
        ...value,
        props: newProps,
      },
    });
  }

  return newInstrs;
}

function createOldToNewPropsMapping(
  env: Environment,
  oldProps: Array<JsxAttribute>,
): Map<IdentifierId, ObjectProperty> {
  const oldToNewProps = new Map();

  for (const oldProp of oldProps) {
    invariant(
      oldProp.kind === 'JsxAttribute',
      `Expected only attributes but found ${oldProp.kind}`,
    );
    const newProp: ObjectProperty = {
      kind: 'ObjectProperty',
      key: {
        kind: 'string',
        name: oldProp.name,
      },
      type: 'property',
      place: createTemporaryPlace(env, GeneratedSource),
    };
    newProp.place.identifier.name = makeIdentifierName(oldProp.name);
    oldToNewProps.set(oldProp.place.identifier.id, newProp);
  }

  return oldToNewProps;
}

function emitDestructureProps(
  env: Environment,
  propsObj: Place,
  properties: Array<ObjectProperty>,
): Instruction {
  const destructurePropsInstr: Instruction = {
    id: makeInstructionId(0),
    lvalue: createTemporaryPlace(env, GeneratedSource),
    loc: GeneratedSource,
    value: {
      kind: 'Destructure',
      lvalue: {
        pattern: {
          kind: 'ObjectPattern',
          properties,
        },
        kind: InstructionKind.Let,
      },
      loc: GeneratedSource,
      value: propsObj,
    },
  };
  return destructurePropsInstr;
}
