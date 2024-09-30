// @enableJsxOutlining
function Component(arr) {
  const x = useX();
  return arr.map(i => {
    let jsx = (
      <Bar x={x}>
        <Baz i={i}></Baz>
      </Bar>
    );
    return jsx;
  });
}

function useX() {
  return 'x';
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [['foo', 'bar']],
};
