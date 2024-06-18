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
