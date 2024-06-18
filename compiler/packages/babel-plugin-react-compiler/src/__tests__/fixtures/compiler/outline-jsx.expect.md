
## Input

```javascript
// @enableOutlineJsx:true

function useFoo() {
  return "foo";
}

function Component(countries, onDelete) {
  const name = useFoo();
  return countries.map(() => {
    return (
      <Foo>
        <Bar>{name}</Bar>
        <Button onclick={onDelete}>delete</Button>
      </Foo>
    );
  });
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ countries: [1, 2], onDelete: () => {} }],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableOutlineJsx:true

function useFoo() {
  return "foo";
}

function Component(countries, onDelete) {
  const $ = _c(7);
  const name = useFoo();
  let t0;
  if ($[0] !== name || $[1] !== onDelete || $[2] !== countries) {
    let t1;
    if ($[4] !== name || $[5] !== onDelete) {
      t1 = () => <T44 name={name} onDelete={onDelete} />;
      $[4] = name;
      $[5] = onDelete;
      $[6] = t1;
    } else {
      t1 = $[6];
    }
    t0 = countries.map(t1);
    $[0] = name;
    $[1] = onDelete;
    $[2] = countries;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  return t0;
}
function T44(name, onDelete) {
  return (
    <Foo>
      <Bar>{name}</Bar>
      <Button onclick={onDelete}>delete</Button>
    </Foo>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ countries: [1, 2], onDelete: () => {} }],
};

```
      
### Eval output
(kind: exception) countries.map is not a function