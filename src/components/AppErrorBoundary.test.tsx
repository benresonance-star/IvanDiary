import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppErrorBoundary } from "./AppErrorBoundary";

function FailingChild(): never {
  throw new Error("Private diary content must not be logged");
}

describe("AppErrorBoundary", () => {
  it("shows a private recovery surface after a render failure", () => {
    render(
      <AppErrorBoundary>
        <FailingChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your saved diary has not been removed.",
    );
    expect(
      screen.getByRole("button", { name: "Reopen my diary" }),
    ).toBeEnabled();
  });
});
