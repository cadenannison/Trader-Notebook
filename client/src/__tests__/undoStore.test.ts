import { beforeEach, describe, expect, it } from "vitest";
import { useUndoStore } from "@/store/undoStore";

const noop = async () => {};

beforeEach(() => {
  useUndoStore.setState({ past: [], future: [] });
});

describe("useUndoStore", () => {
  it("starts empty", () => {
    const { past, future } = useUndoStore.getState();
    expect(past).toHaveLength(0);
    expect(future).toHaveLength(0);
  });

  it("push adds frame to past", () => {
    useUndoStore
      .getState()
      .push({ label: "delete NVDA", undo: noop, redo: noop });
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().past[0].label).toBe("delete NVDA");
  });

  it("push clears future", () => {
    useUndoStore.setState({
      past: [],
      future: [{ label: "stale", undo: noop, redo: noop }],
    });
    useUndoStore
      .getState()
      .push({ label: "new action", undo: noop, redo: noop });
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it("push caps history at 20 entries", () => {
    for (let i = 0; i < 25; i++) {
      useUndoStore
        .getState()
        .push({ label: `frame-${i}`, undo: noop, redo: noop });
    }
    expect(useUndoStore.getState().past).toHaveLength(20);
  });

  it("popUndo returns the last frame and moves it to future", () => {
    useUndoStore.getState().push({ label: "action-a", undo: noop, redo: noop });
    const frame = useUndoStore.getState().popUndo();
    expect(frame?.label).toBe("action-a");
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(1);
  });

  it("popUndo returns undefined on empty stack", () => {
    expect(useUndoStore.getState().popUndo()).toBeUndefined();
  });

  it("popRedo returns the first future frame and moves it to past", () => {
    useUndoStore.setState({
      past: [],
      future: [{ label: "redo-me", undo: noop, redo: noop }],
    });
    const frame = useUndoStore.getState().popRedo();
    expect(frame?.label).toBe("redo-me");
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it("popRedo returns undefined on empty future", () => {
    expect(useUndoStore.getState().popRedo()).toBeUndefined();
  });

  it("undo then redo roundtrip restores original state", () => {
    useUndoStore
      .getState()
      .push({ label: "roundtrip", undo: noop, redo: noop });
    useUndoStore.getState().popUndo();
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(1);
    useUndoStore.getState().popRedo();
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it("multiple pushes then undo steps back one at a time", () => {
    useUndoStore.getState().push({ label: "first", undo: noop, redo: noop });
    useUndoStore.getState().push({ label: "second", undo: noop, redo: noop });
    useUndoStore.getState().push({ label: "third", undo: noop, redo: noop });

    const a = useUndoStore.getState().popUndo();
    expect(a?.label).toBe("third");
    const b = useUndoStore.getState().popUndo();
    expect(b?.label).toBe("second");
    expect(useUndoStore.getState().future).toHaveLength(2);
  });
});
