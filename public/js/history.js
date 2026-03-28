/* === HISTORY (Undo/Redo) === */
const History = {
  stack: [],
  pointer: -1,
  maxSize: 50,

  push(state) {
    // Remove any future states after current pointer
    this.stack = this.stack.slice(0, this.pointer + 1);
    // Deep clone the state
    this.stack.push(JSON.parse(JSON.stringify(state)));
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
    this.pointer = this.stack.length - 1;
    this.updateButtons();
  },

  undo() {
    if (this.pointer <= 0) return null;
    this.pointer--;
    this.updateButtons();
    return JSON.parse(JSON.stringify(this.stack[this.pointer]));
  },

  redo() {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer++;
    this.updateButtons();
    return JSON.parse(JSON.stringify(this.stack[this.pointer]));
  },

  canUndo() { return this.pointer > 0; },
  canRedo() { return this.pointer < this.stack.length - 1; },

  updateButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.style.opacity = this.canUndo() ? '1' : '0.3';
    if (redoBtn) redoBtn.style.opacity = this.canRedo() ? '1' : '0.3';
  },

  clear() {
    this.stack = [];
    this.pointer = -1;
    this.updateButtons();
  }
};
