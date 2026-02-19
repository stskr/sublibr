import { useState, useCallback } from 'react';

interface UndoRedoState<T> {
    past: T[];
    present: T;
    future: T[];
}

export function useUndoRedo<T>(initialState: T) {
    const [state, setState] = useState<UndoRedoState<T>>({
        past: [],
        present: initialState,
        future: [],
    });

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => {
        console.log('[useUndoRedo] undo called');
        setState((currentState) => {
            const { past, present, future } = currentState;
            console.log('[useUndoRedo] undoing. Past length:', past.length);
            if (past.length === 0) return currentState;

            const previous = past[past.length - 1];
            const newPast = past.slice(0, past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [present, ...future],
            };
        });
    }, []);

    const redo = useCallback(() => {
        console.log('[useUndoRedo] redo called');
        setState((currentState) => {
            const { past, present, future } = currentState;
            console.log('[useUndoRedo] redoing. Future length:', future.length);
            if (future.length === 0) return currentState;

            const next = future[0];
            const newFuture = future.slice(1);

            return {
                past: [...past, present],
                present: next,
                future: newFuture,
            };
        });
    }, []);

    const set = useCallback((newPresent: T) => {
        setState((currentState) => {
            const { past, present } = currentState;
            const newPast = [...past, present];
            if (newPast.length > 50) newPast.splice(0, newPast.length - 50);
            return {
                past: newPast,
                present: newPresent,
                future: [],
            };
        });
    }, []);

    const reset = useCallback((newPresent: T) => {
        setState({
            past: [],
            present: newPresent,
            future: [],
        });
    }, []);

    return [state.present, set, undo, redo, canUndo, canRedo, reset] as const;
}
