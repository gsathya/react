
## Input

```javascript
// @enableJsxOutlining
function Component(arr) {
  const x = useX();
  return arr.map(i => {
    return (
      <Bar x={x}>
        <Baz i={i}></Baz>
      </Bar>
    );
  });
}

function useX() {
  return 'x';
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [['foo', 'bar']],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableJsxOutlining
function Component(arr) {
  const $ = _c(5);
  const x = useX();
  let t0;
  if ($[0] !== x || $[1] !== arr) {
    let t1;
    if ($[3] !== x) {
      t1 = (i) => {
        const T0 = _temp;
        return <T0 i={i} x={x} />;
      };
      $[3] = x;
      $[4] = t1;
    } else {
      t1 = $[4];
    }
    t0 = arr.map(t1);
    $[0] = x;
    $[1] = arr;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}
function _temp(t0) {
  const $ = _c(5);
  const { i: i, x: x } = t0;
  let t1;
  if ($[0] !== i) {
    t1 = <Baz i={i} />;
    $[0] = i;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== x || $[3] !== t1) {
    t2 = <Bar x={x}>{t1}</Bar>;
    $[2] = x;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

function useX() {
  return "x";
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [["foo", "bar"]],
};

```
      