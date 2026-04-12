import { callCreated } from './dom';
import { Mount, DrawingContext, HydrationContext, VTree, VText, DOMRef, VTreeType } from './types';

/* prerendering / hydration / isomorphic support */
function collapseSiblingTextNodes(vs: Array<VTree<DOMRef>>): Array<VTree<DOMRef>> {
  var ax = 0, adjusted = vs.length > 0 ? [vs[0]] : [];
  for (var ix = 1; ix < vs.length; ix++) {
    if (adjusted[ax].type === VTreeType.VText && vs[ix].type === VTreeType.VText) {
      (adjusted[ax] as VText<DOMRef>).text += (vs[ix] as VText<DOMRef>).text;
      continue;
    }
    adjusted[++ax] = vs[ix];
  }
  return adjusted;
}

export function hydrate(logLevel: boolean, mountPoint: DOMRef | Text, vtree: VTree<DOMRef>, context: HydrationContext<DOMRef>, drawingContext: DrawingContext<DOMRef>): boolean {
  console.log("hydrate.ts - hydrate enter");

  /* hydration mountPoint must be the root */
  if (!vtree || !mountPoint) return false;

  /* Don't hydrate on text mountPoint */
  if (mountPoint.nodeType === 3) return false;

  const vdomPath = [];
  const domPath = [];

  // Print the full VTree structure for debugging
  if (logLevel) {
    console.log('[DEBUG_HYDRATE] === Full VTree Structure ===');
    printVTreeTree(vtree, 0, true);
    console.log('[DEBUG_HYDRATE] === End VTree Structure ===');
  }

  // begin walking the DOM, report the result
  if (!walk(logLevel, vtree, context.firstChild(mountPoint as DOMRef), context, drawingContext, vdomPath, domPath)) {
    // If we failed to prerender because the structures were different, fallback to drawing
      if (logLevel) {
        console.warn('[DEBUG_HYDRATE] Could not copy DOM into virtual DOM, falling back to diff');
      }
      while (context.firstChild(mountPoint as DOMRef))
        drawingContext.removeChild(mountPoint as DOMRef, context.lastChild(mountPoint as DOMRef));

     return false;
  } else {
    if (logLevel) {
      console.info('[DEBUG_HYDRATE] Successfully prerendered page');
    }
  }
  return true;
}

// Add this helper function near diagnoseError
function printPaths(vdomPath: Array<any>, domPath: Array<any>): void {
  console.warn('[DEBUG_HYDRATE] === VDOM Path ===');
  for (let i = 0; i < vdomPath.length; i++) {
    console.warn(`[DEBUG_HYDRATE] [${i}]`, vdomPath[i]);
  }
  console.warn('[DEBUG_HYDRATE] === DOM Path ===');
  for (let i = 0; i < domPath.length; i++) {
    console.warn(`[DEBUG_HYDRATE] [${i}]`, domPath[i]);
  }
}

// Recursive helper to print the full VTree structure using formatVTreeForPath
function printVTreeTree(vtree: VTree<DOMRef>, depth: number = 0, logLevel: boolean = true): void {
  if (!logLevel) return;
  
  const indent = '  '.repeat(depth);
  const label = formatVTreeForPath(vtree);
  console.log(`[DEBUG_VTREE] ${indent}${label}`);
  
  switch (vtree.type) {
    case VTreeType.VNode: {
      const vnode = vtree as VNode<DOMRef>;
      // Recurse into children array
      if (vnode.children && vnode.children.length > 0) {
        for (const child of vnode.children) {
          printVTreeTree(child, depth + 1, logLevel);
        }
      }
      break;
    }
    case VTreeType.VComp: {
      const vcomp = vtree as VComp<DOMRef>;
      // VComp has a single `child` property (not an array)
      if (vcomp.child) {
        printVTreeTree(vcomp.child, depth + 1, logLevel);
      }
      break;
    }
    case VTreeType.VText:
      // Leaf node, nothing to recurse into
      break;
  }
}

// Helper to format a VTree node with identifying attributes for debug paths
function formatVTreeForPath(vtree: VTree<DOMRef>): string {
  switch (vtree.type) {
    case VTreeType.VNode: {
      const vnode = vtree as VNode<DOMRef>;
      const attrs: string[] = [];
      
      // Add key if present (useful for debugging lists)
      if (vnode.key) attrs.push(`key="${vnode.key}"`);
      
      // Add id from props
      if (vnode.props && vnode.props.id) attrs.push(`id="${vnode.props.id}"`);
      
      // Add class information - classList is a Set<string>
      if (vnode.classList && vnode.classList.size > 0) {
        const classes = Array.from(vnode.classList).join(' ');
        attrs.push(`class="${classes}"`);
      } else if (vnode.props && vnode.props.class) {
        // Fallback to props.class if classList is empty
        attrs.push(`class="${vnode.props.class}"`);
      }
      
      // Add a few common distinguishing props if still no identifying attrs
      if (attrs.length <= 1 && vnode.props) { // <=1 because we always have key or id/class if present
        const priorityProps = ['name', 'type', 'href', 'src', 'data-id', 'data-key'];
        for (const prop of priorityProps) {
          if (vnode.props[prop]) {
            const val = String(vnode.props[prop]).slice(0, 50);
            // Avoid duplicating if already added as id/class
            if (!attrs.some(a => a.startsWith(`${prop}="`))) {
              attrs.push(`${prop}="${val}"`);
            }
            break;
          }
        }
      }
      
      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
      return `<${vnode.tag}${attrStr}>`;
    }
    case VTreeType.VText: {
      const txt = (vtree as VText<DOMRef>).text;
      return `#text "${txt.slice(0, 30)}${txt.length > 30 ? '...' : ''}"`;
    }
    case VTreeType.VComp: {
      const vcomp = vtree as VComp<DOMRef>;
      const id = vcomp.componentId || vcomp.key || 'unknown';
      return `<VComp id: ${id}>`;
    }
    default:
      return `<unknown type: ${vtree.type}>`;
  }
}

// Replace the existing diagnoseError with:
function diagnoseError(logLevel: boolean, vtree: VTree<DOMRef>, node: Node | null, vdomPath: Array<any>, domPath: Array<any>): void {
  if (logLevel) {
    console.warn('[DEBUG_HYDRATE] VTree differed from node');
    printPaths(vdomPath, domPath);
    console.warn('[DEBUG_HYDRATE] VTree:', vtree);
    console.warn('[DEBUG_HYDRATE] DOM node:', node);
  }
}

function debugCompareUnicode(vText: string, dText: string): boolean {
  // [...string] iterates by Unicode code points, correctly handling surrogate pairs
  const vChars = [...vText];
  const dChars = [...dText];
  const maxLen = Math.max(vChars.length, dChars.length);

  for (let i = 0; i < maxLen; i++) {
    const v = vChars[i];
    const d = dChars[i];

    if (v === undefined) {
      console.error(`ERROR: Length mismatch at index ${i}. Virtual tree ended, but DOM contains extra character: "${d}"`);
      return false;
    }
    if (d === undefined) {
      console.error(`ERROR: Length mismatch at index ${i}. DOM ended, but virtual tree contains extra character: "${v}"`);
      return false;
    }
    if (v !== d) {
      console.error(`ERROR: Character mismatch at index ${i}. Expected "${v}" (virtual tree), but got "${d}" (DOM)`);
      return false;
    }
  }

  console.log(`SUCCESS: Text strings match exactly (${vChars.length} characters).`);
  return true;
}

function walk(logLevel: boolean, vtree: VTree<DOMRef>, node: Node, context: HydrationContext<DOMRef>, drawingContext: DrawingContext<DOMRef>, vdomPath, domPath): boolean {
  // Push current node info to paths if logging
  if (logLevel) {
    vdomPath.push(formatVTreeForPath(vtree));
    domPath.push(node);
  }

  // console.log("[DEBUG_WALK]", formatVTreeForPath(vtree), node);

  // This is slightly more complicated than one might expect since
  // browsers will collapse consecutive text nodes into a single text node.
  // There can thus be fewer DOM nodes than VDOM nodes.
  // We handle this in collapseSiblingTextNodes
  switch (vtree.type) {
    case VTreeType.VComp:
       let mounted: Mount<DOMRef> = vtree.mount (node.parentNode as DOMRef);

       // // Print the full VTree structure for debugging
       // if (logLevel) {
       //   console.log('[DEBUG_HYDRATE] === Full VTree Structure after mount ===');
       //   printVTreeTree(mounted.componentTree, 0, true);
       //   console.log('[DEBUG_HYDRATE] === End VTree Structure after mount ===');
       // }

       vtree.componentId = mounted.componentId;
       vtree.child = mounted.componentTree;
       mounted.componentTree.parent = vtree;
       if (!walk(logLevel, vtree.child, node, context, drawingContext, vdomPath, domPath)) {
          return false;
       }
       break;
    case VTreeType.VText: {
      // Condition 1: Verify node type
      if (node.nodeType !== 3) {
        console.error(`ERROR: Expected a Text Node (nodeType 3), but received nodeType ${node.nodeType}`);
        diagnoseError(logLevel, vtree, node, vdomPath, domPath);
        return false;
      }

      // Condition 2: Extract strings safely
      const vStr = vtree.text ?? '';
      const dStr = node.data; // .data is the standard, zero-overhead property for TEXT_NODEs

      // Condition 3: Character-by-character comparison
      if (!debugCompareUnicode(vStr, dStr)) {
        // JSON.stringify safely escapes invisible chars like \n, \t, \r for readable console output
        console.error(`DETAILS - Virtual Text: ${JSON.stringify(vStr)}`);
        console.error(`DETAILS - DOM Text:     ${JSON.stringify(dStr)}`);
        diagnoseError(logLevel, vtree, node, vdomPath, domPath);
        return false;
      }

      // All conditions passed
      vtree.domRef = node as DOMRef;
      break;
    }
    case VTreeType.VNode:
      if (node.nodeType !== 1) {
        diagnoseError(logLevel, vtree, node, vdomPath, domPath);
        return false;
      }
      vtree.domRef = node as DOMRef;
      vtree.children = collapseSiblingTextNodes(vtree.children);
      // Fire onCreated events as though the elements had just been created.
      callCreated(node, vtree, drawingContext);

      // Save path state before iterating children
      const savedVdomPath = logLevel ? [...vdomPath] : null;
      const savedDomPath = logLevel ? [...domPath] : null;

      for (var i = 0; i < vtree.children.length; i++) {
        if (logLevel) {
          vdomPath.length = 0;
          domPath.length = 0;
          vdomPath.push(...savedVdomPath!);
          domPath.push(...savedDomPath!);
        }

        const vdomChild = vtree.children[i];
        const domChild = node.childNodes[i];
        if (!domChild) {
          diagnoseError(logLevel, vdomChild, domChild, vdomPath, domPath);
          return false;
        }
        if (!walk(logLevel, vdomChild, domChild, context, drawingContext, vdomPath, domPath)) {
          return false;
        }
      }
      break;
  }
  return true;
}
