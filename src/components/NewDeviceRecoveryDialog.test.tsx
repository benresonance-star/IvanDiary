import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NewDeviceRecoveryDialog } from "./NewDeviceRecoveryDialog";

describe("NewDeviceRecoveryDialog", () => {
  it("offers latest state, history, and an explicit new diary choice", () => {
    const onRestoreHistory = vi.fn();
    const entry = {
      id: "history-1",
      capturedAt: "2026-08-17T03:00:00Z",
      entryDay: "2026-08-17",
      reason: "automatic" as const,
      deviceName: "Ivan's iPad",
      revision: 12,
      assetCount: 4,
      byteLength: 100,
      protected: false,
    };
    render(
      <NewDeviceRecoveryDialog
        busy={false}
        entries={[entry]}
        onRestoreHistory={onRestoreHistory}
        onRestoreLatest={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Your diary is in iCloud" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restore latest diary/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new diary" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ivan's iPad/ }));
    expect(onRestoreHistory).toHaveBeenCalledWith(entry);
  });
});
