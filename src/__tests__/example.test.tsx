import { render, screen } from "@testing-library/react";

function HelloWorld() {
  return <h1>Hello, World!</h1>;
}

describe("Example Test", () => {
  it("renders hello world", () => {
    render(<HelloWorld />);
    expect(screen.getByText("Hello, World!")).toBeInTheDocument();
  });
});
