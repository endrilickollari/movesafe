import * as ts from 'typescript';

/**
 * Recursively walks every descendant of `root` via `ts.forEachChild`,
 * invoking `visit` for each node. This is the single traversal primitive
 * used across the codebase instead of regex-based scanning.
 */
export function forEachDescendant(root: ts.Node, visit: (node: ts.Node) => void): void {
  const walk = (node: ts.Node): void => {
    visit(node);
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(root, walk);
}
