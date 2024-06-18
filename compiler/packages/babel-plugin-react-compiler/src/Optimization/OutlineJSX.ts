/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CompilerError } from "../CompilerError";
import {
  Effect,
  Environment,
  GeneratedSource,
  HIRFunction,
  Identifier,
  IdentifierId,
  Instruction,
  JsxAttribute,
  JsxExpression,
  LoadGlobal,
  LoadLocal,
  OutlinedFunctionExpression,
  Place,
  isJSXType,
  makeInstructionId,
  makeType,
} from "../HIR";
import { eachInstructionOperand } from "../HIR/visitors";

/*
OutlineJSX
- [DONE] bailout if params are mutated
- [DONE] bailout if it doesn't return jsx
- bailout if depth is 1
- [DONE] only compile if passed to [Method]Call
*/

export function outlineJSX(fn: HIRFunction): void {
  const state = new State();
  for (const [, block] of fn.body.blocks) {
    for (const instr of block.instructions) {
      if (instr.value.kind == "FunctionExpression") {
        state.add(instr.lvalue.identifier, instr);
      }
      if (instr.value.kind === "MethodCall") {
        for (const operand of eachInstructionOperand(instr)) {
          process(operand, state);
        }
      }
    }
  }
}

class State {
  fnInstrs: Map<IdentifierId, Instruction> = new Map();

  add(id: Identifier, fnInstr: Instruction): void {
    // TODO(gsn): Should we store names as well? Or is SSA id enough?
    this.fnInstrs.set(id.id, fnInstr);
  }
}

function process(operand: Place, state: State): void {
  const fnInstr = state.fnInstrs.get(operand.identifier.id);
  if (fnInstr === undefined) {
    return;
  }

  const fn = fnInstr.value;
  CompilerError.invariant(fn.kind === "FunctionExpression", {
    reason: `Expected ${fn} to be a function`,
    loc: fn.loc,
  });
  const loweredFunc = fn.loweredFunc;

  // TODO(gsn): Handle functions with params
  if (loweredFunc.func.params.length > 0) {
    return;
  }

  /*
   * Only outline functions that do not mutate their dependencies.
   * After outlining, these deps will be passed as props which can
   * not be mutated.
   */
  for (const dep of loweredFunc.dependencies) {
    if (dep.effect !== Effect.Read) {
      return;
    }
  }

  /*
   * Only outline functions without control flow for now. In the future,
   * we can extend this to more complex functions.
   */
  if (loweredFunc.func.body.blocks.size > 1) {
    return;
  }

  const [[blockId, block]] = loweredFunc.func.body.blocks;
  if (block.terminal.kind !== "return") {
    return;
  }

  if (!isJSXType(block.terminal.value.identifier)) {
    return;
  }

  const env = loweredFunc.func.env;
  const instructions: Array<Instruction> = [];
  const outlinedJSxComponentTemporaryName = `T${env.nextIdentifierId}`;
  const loadJsxComponent: LoadGlobal = {
    kind: "LoadGlobal",
    binding: {
      kind: "Global",
      name: outlinedJSxComponentTemporaryName,
    },
    loc: GeneratedSource,
  };
  const loadJsxComponentLvalue = buildTemporaryPlace(env);
  instructions.push({
    id: makeInstructionId(0),
    value: loadJsxComponent,
    loc: GeneratedSource,
    lvalue: loadJsxComponentLvalue,
  });

  const props: Array<JsxAttribute> = [];
  for (const val of loweredFunc.func.context) {
    const local: LoadLocal = {
      kind: "LoadLocal",
      place: val,
      loc: GeneratedSource,
    };
    const lvalue = buildTemporaryPlace(env);
    instructions.push({
      id: makeInstructionId(0),
      value: local,
      loc: GeneratedSource,
      lvalue,
    });

    const name = val.identifier.name;
    CompilerError.invariant(name !== null, {
      reason: `Expected ${val.identifier} to have a name`,
      loc: null,
    });
    props.push({
      kind: "JsxAttribute",
      name: name.value as string,
      place: lvalue,
    });
  }

  const jsx: JsxExpression = {
    kind: "JsxExpression",
    tag: loadJsxComponentLvalue,
    props,
    children: null,
    loc: GeneratedSource,
    openingLoc: GeneratedSource,
    closingLoc: GeneratedSource,
  };
  const jsxLvalue = buildTemporaryPlace(env);
  instructions.push({
    id: makeInstructionId(0),
    value: jsx,
    lvalue: jsxLvalue,
    loc: GeneratedSource,
  });
  const newBlock = { ...block };
  newBlock.instructions = instructions;
  newBlock.terminal = {
    kind: "return",
    loc: GeneratedSource,
    value: jsxLvalue,
    id: makeInstructionId(0),
  };
  const newBlocks = new Map(loweredFunc.func.body.blocks);
  newBlocks.set(blockId, newBlock);
  const newLoweredFunc: HIRFunction = {
    ...loweredFunc.func,
    body: { entry: blockId, blocks: newBlocks },
  };
  const outlinedFunc: OutlinedFunctionExpression = {
    loweredFunc: {
      dependencies: loweredFunc.dependencies,
      func: newLoweredFunc,
    },
    kind: "OutlinedFunctionExpression",
    outlinedFunc: {
      ...loweredFunc.func,
      id: outlinedJSxComponentTemporaryName,
      params: loweredFunc.func.context,
    },
    name: null,
    expr: fn.expr,
    loc: GeneratedSource,
  };

  fnInstr.value = outlinedFunc;
}

function buildTemporaryPlace(env: Environment): Place {
  const id: Identifier = {
    id: env.nextIdentifierId,
    name: null,
    mutableRange: { start: makeInstructionId(0), end: makeInstructionId(0) },
    scope: null,
    type: makeType(),
    loc: GeneratedSource,
  };
  const place: Place = {
    kind: "Identifier",
    identifier: id,
    effect: Effect.Unknown,
    reactive: false,
    loc: GeneratedSource,
  };
  return place;
}
