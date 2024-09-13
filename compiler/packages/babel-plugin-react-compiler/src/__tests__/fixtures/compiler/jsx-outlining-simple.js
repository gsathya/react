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
