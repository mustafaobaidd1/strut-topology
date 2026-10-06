import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('undo/redo history', () => {
  it('undoes and redoes in order and clears redo on a new edit', () => {
    const h = new History('a');
    h.push('b');
    h.push('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    h.push('d');
    expect(h.canRedo).toBe(false);
    expect(h.current).toBe('d');
    expect(h.undo()).toBe('b');
  });

  it('replace() changes the present without an undo step', () => {
    const h = new History(1);
    h.push(2);
    h.replace(3);
    expect(h.undo()).toBe(1);
    expect(h.redo()).toBe(3);
  });

  it('keeps at most `limit` undo steps', () => {
    const h = new History(0, 3);
    for (let i = 1; i <= 10; i++) h.push(i);
    let n = 0;
    while (h.undo() !== null) n++;
    expect(n).toBe(3);
  });
});
