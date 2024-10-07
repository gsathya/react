
## Input

```javascript
// @enablePropagateDepsInHIR
function Component(props) {
  let x = [];
  let y = null;
  if (props.cond) {
    x.push(props.a);
    // oops no memo!
    return x;
  } else {
    y = foo();
    if (props.b) {
      return;
    }
  }
  return y;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{cond: true, a: 42}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enablePropagateDepsInHIR
function Component(props) {
  const $ = _c(6);
  let y;
  let t0;
  if ($[0] !== props.cond || $[1] !== props.a || $[2] !== props.b) {
    t0 = Symbol.for("react.early_return_sentinel");
    bb0: {
      const x = [];
      if (props.cond) {
        x.push(props.a);
        t0 = x;
        break bb0;
      } else {
        let t1;
        if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = foo();
          $[5] = t1;
        } else {
          t1 = $[5];
        }
        y = t1;
        if (props.b) {
          t0 = undefined;
          break bb0;
        }
      }
    }
    $[0] = props.cond;
    $[1] = props.a;
    $[2] = props.b;
    $[3] = y;
    $[4] = t0;
  } else {
    y = $[3];
    t0 = $[4];
  }
  if (t0 !== Symbol.for("react.early_return_sentinel")) {
    return t0;
  }
  return y;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ cond: true, a: 42 }],
};

```
      
### Eval output
(kind: ok) [42]