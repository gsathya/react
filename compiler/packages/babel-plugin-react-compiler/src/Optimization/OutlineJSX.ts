/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CompilerError } from "../CompilerError";
import {
  Effect,
  HIRFunction,
  Identifier,
  IdentifierId,
  Instruction,
  OutlinedFunctionExpression,
  Place,
  isJSXType,
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

  shouldOutline(place: Place): boolean {
    return this.fnInstrs.has(place.identifier.id);
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
    loc: fn.loc
  });
  const loweredFunc = fn.loweredFunc;

  /*
  * Only outline functions that do not mutate their dependencies.
  * After outlining, these deps will be passed as props which can
  * not be mutated.
  */
  for (const dep of loweredFunc.dependencies) {
    if (dep.effect !== Effect.Read)  {
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

  const [[_, block]] = loweredFunc.func.body.blocks;
  if (block.terminal.kind !== "return") {
    return;
  }

  if (!isJSXType(block.terminal.value.identifier)) {
    return;
  }

  const outlinedJsx: OutlinedFunctionExpression = {
    ...fn,
    kind: "OutlinedFunctionExpression",
  }

  fnInstr.value = outlinedJsx;
}
