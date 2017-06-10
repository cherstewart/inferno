import {
	isArray,
	isFunction,
	isInvalid,
	isNull,
	isNullOrUndef,
	isNumber,
	isString,
	isStringOrNumber,
	isUndefined,
	LifecycleClass,
	NO_OP,
	throwError
} from 'inferno-shared';
import VNodeFlags from 'inferno-vnode-flags';
import { IFiber, Fiber } from '../core/fiber';
import { options } from '../core/options';
import { createTextVNode, createVoidVNode, isVNode, IVNode } from '../core/vnode';
import { booleanProps, delegatedEvents, isUnitlessNumber, namespaces, skipProps, strictProps } from './constants';
import { handleEvent } from './events/delegation';
import { mount, mountArrayChildren, mountComponent, mountElement, mountRef, mountText } from './mounting';
import { unmount } from './unmounting';
import {
	appendChild,
	EMPTY_OBJ,
	insertOrAppend,
	isKeyed,
	removeAllChildren,
	replaceChild,
	replaceDOM,
	replaceWithNewNode,
	setTextContent,
	updateTextContent
} from './utils';
import { isControlledFormElement, processElement } from './wrappers/processelements';
import { next } from 'most-subject';

export function patch(fiber: IFiber, nextInput: IVNode | string | number, parentDom: Element, lifecycle: LifecycleClass, context, isSVG: boolean, isRecycling: boolean) {
	// LastInput cannot be null or undef or invalid, because they have been filtered out
	const lastInput = fiber.input;
	// Next should never come here being invalid, filter outside

	if (lastInput !== nextInput) {
		if (isStringOrNumber(nextInput)) {
			if (isStringOrNumber(lastInput)) {
				patchText(fiber, nextInput);
			} else {
				replaceDOM(fiber, parentDom, mountText(fiber, nextInput, null), lifecycle, isRecycling);
			}
		} else if (isStringOrNumber(lastInput)) {
			replaceDOM(fiber, parentDom, mount(fiber, nextInput, null, lifecycle, context, isSVG), lifecycle, isRecycling);
		} else {
			const lastFlags = lastInput.flags;
			const nextFlags = nextInput.flags;

			if (nextFlags & VNodeFlags.Element) {
				if (lastFlags & VNodeFlags.Element) {
					patchElement(fiber, lastInput, nextInput, parentDom, lifecycle, context, isSVG, isRecycling);
				} else {
					replaceDOM(
						fiber,
						parentDom,
						mountElement(
							fiber,
							nextInput,
							null,
							lifecycle,
							context,
							isSVG
						),
						lifecycle,
						isRecycling
					);
				}
			} else if (nextFlags & VNodeFlags.Component) {
				const isClass = (nextFlags & VNodeFlags.ComponentClass) > 0;

				if (lastFlags & VNodeFlags.Component) {
					// patchComponent(
					// 	lastVNode,
					// 	nextVNode,
					// 	parentDom,
					// 	lifecycle,
					// 	context,
					// 	isSVG,
					// 	isClass,
					// 	isRecycling
					// );
				} else {
					// replaceDOM(
					// 	fiber,
					// 	parentDom,
					// 	mountComponent(
					// 		nextVNode,
					// 		null,
					// 		lifecycle,
					// 		context,
					// 		isSVG,
					// 		isClass
					// 	),
					// 	lastVNode,
					// 	lifecycle,
					// 	isRecycling
					// );
				}
			}
		}
	}
}

function unmountChildren(fiber: IFiber, children, dom: Element, lifecycle: LifecycleClass, isRecycling: boolean) {
	// TODO: Check this
	if (children.flags > 0) {
		unmount(fiber, dom, lifecycle, true, isRecycling);
	} else if (isArray(children)) {
		removeAllChildren(dom, children, lifecycle, isRecycling);
	} else {
		dom.textContent = '';
	}
	fiber.children = null;
}

export function patchElement(fiber: IFiber, lastVNode: IVNode, nextVNode: IVNode, parentDom: Element | null, lifecycle: LifecycleClass, context: Object, isSVG: boolean, isRecycling: boolean) {
	const nextTag = nextVNode.type;
	const lastTag = lastVNode.type;

	if (lastTag !== nextTag) {
		replaceWithNewNode(lastVNode, nextVNode, parentDom, lifecycle, context, isSVG, isRecycling);
	} else {
		const dom = fiber.dom as Element;
		const lastProps = lastVNode.props;
		const nextProps = nextVNode.props;
		const lastChildren = lastVNode.children;
		const nextChildren = nextVNode.children;
		const lastFlags = lastVNode.flags;
		const nextFlags = nextVNode.flags;
		const nextRef = nextVNode.ref;
		const lastClassName = lastVNode.className;
		const nextClassName = nextVNode.className;

		isSVG = isSVG || (nextFlags & VNodeFlags.SvgElement) > 0;
		if (lastChildren !== nextChildren) {
			const childrenIsSVG = isSVG === true && nextVNode.type !== 'foreignObject';
			patchChildren(fiber, lastFlags, nextFlags, fiber.children, nextChildren, dom, lifecycle, context, childrenIsSVG, isRecycling);
		}

		// inlined patchProps  -- starts --
		if (lastProps !== nextProps) {
			const lastPropsOrEmpty = lastProps || EMPTY_OBJ;
			const nextPropsOrEmpty = nextProps || EMPTY_OBJ as any;
			let hasControlledValue = false;

			if (nextPropsOrEmpty !== EMPTY_OBJ) {
				const isFormElement = (nextFlags & VNodeFlags.FormElement) > 0;
				if (isFormElement) {
					hasControlledValue = isControlledFormElement(nextPropsOrEmpty);
				}

				for (const prop in nextPropsOrEmpty) {
					// do not add a hasOwnProperty check here, it affects performance
					const nextValue = nextPropsOrEmpty[prop];
					const lastValue = lastPropsOrEmpty[prop];

					patchProp(prop, lastValue, nextValue, dom, isSVG, hasControlledValue);
				}

				if (isFormElement) {
					// When inferno is recycling form element, we need to process it like it would be mounting
					processElement(nextFlags, nextVNode, dom, nextPropsOrEmpty, isRecycling, hasControlledValue);
				}
			}
			if (lastPropsOrEmpty !== EMPTY_OBJ) {
				for (const prop in lastPropsOrEmpty) {
					// do not add a hasOwnProperty check here, it affects performance
					if (isNullOrUndef(nextPropsOrEmpty[prop]) && !isNullOrUndef(lastPropsOrEmpty[prop])) {
						removeProp(prop, lastPropsOrEmpty[prop], dom, nextFlags);
					}
				}
			}
		}
		// inlined patchProps  -- ends --
		if (lastClassName !== nextClassName) {
			if (isNullOrUndef(nextClassName)) {
				dom.removeAttribute('class');
			} else {
				if (isSVG) {
					dom.setAttribute('class', nextClassName);
				} else {
					dom.className = nextClassName;
				}
			}
		}
		if (nextRef) {
			if (lastVNode.ref !== nextRef || isRecycling) {
				mountRef(dom as Element, nextRef, lifecycle);
			}
		}
	}
}

function patchChildren(fiber: IFiber, lastFlags: VNodeFlags, nextFlags: VNodeFlags, lastChildFibers: IFiber[], nextChildren, dom: Element, lifecycle: LifecycleClass, context: Object, isSVG: boolean, isRecycling: boolean) {
	let patchArray = false;
	let patchKeyed = false;

	if (nextFlags & VNodeFlags.HasNonKeyedChildren) {
		patchArray = true;
	} else if ((lastFlags & VNodeFlags.HasKeyedChildren) > 0 && (nextFlags & VNodeFlags.HasKeyedChildren) > 0) {
		patchKeyed = true;
		patchArray = true;
	} else if (isInvalid(nextChildren)) {
		unmountChildren(fiber, lastChildFibers, dom, lifecycle, isRecycling);
	} else if (isInvalid(lastChildFibers)) {
		if (isStringOrNumber(nextChildren)) {
			setTextContent(dom, nextChildren);
		} else {
			if (isArray(nextChildren)) {
				mountArrayChildren(fiber, nextChildren, dom, lifecycle, context, isSVG, 0);
			} else {
				mount(fiber, nextChildren, dom, lifecycle, context, isSVG);
			}
		}
	} else if (isStringOrNumber(nextChildren)) {
		if (isStringOrNumber(lastChildFibers)) {
			updateTextContent(dom, nextChildren);
		} else {
			unmountChildren(fiber, lastChildFibers, dom, lifecycle, isRecycling);
			setTextContent(dom, nextChildren);
		}
	} else if (isStringOrNumber(lastChildFibers)) {
		unmountChildren(fiber, lastChildFibers, dom, lifecycle, isRecycling);
		if (isArray(nextChildren)) {
			mountArrayChildren(fiber, nextChildren, dom, lifecycle, context, isSVG, 0);
		} else {
			mount(fiber, nextChildren, dom, lifecycle, context, isSVG);
		}
	} else if (isArray(nextChildren)) {
		if (isArray(lastChildFibers)) {
			patchArray = true;
			// TODO: Keyed children fiber
			// if (isKeyed(lastChildren, nextChildren)) {
			// 	patchKeyed = true;
			// }
		} else {
			unmountChildren(fiber, lastChildFibers, dom, lifecycle, isRecycling);
			mountArrayChildren(fiber, nextChildren, dom, lifecycle, context, isSVG, 0);
		}
	} else if (isArray(lastChildFibers)) {
		removeAllChildren(dom, lastChildFibers, lifecycle, isRecycling);
		mount(fiber, nextChildren, dom, lifecycle, context, isSVG);
	} else {
		// next is input, last is input
		patch(lastChildFibers, nextChildren, dom, lifecycle, context, isSVG, isRecycling);
	}
	if (patchArray) {
		// Common optimizations for arrays
		const lastLength = (fiber.children as any[]).length;
		const nextLength = nextChildren.length;

		if (lastLength === 0) {
			if (nextLength > 0) {
				mountArrayChildren(fiber, nextChildren, dom, lifecycle, context, isSVG, 0);
			}
			return;
		} else if (nextLength === 0) {
			removeAllChildren(dom, lastChildFibers, lifecycle, isRecycling);
			return;
		}


		if (patchKeyed) {
			// patchKeyedChildren(lastChildFibers, nextChildren, dom, lifecycle, context, isSVG, isRecycling, lastLength, nextLength);
		} else {
			patchNonKeyedChildren(fiber, lastChildFibers, nextChildren, dom, lifecycle, context, isSVG, isRecycling, lastLength);
		}
	}
}

const C = options.component;

export function patchComponent(lastVNode, nextVNode, parentDom, lifecycle: LifecycleClass, context, isSVG: boolean, isClass: boolean, isRecycling: boolean) {
	const lastType = lastVNode.type;
	const nextType = nextVNode.type;
	const lastKey = lastVNode.key;
	const nextKey = nextVNode.key;

	if (lastType !== nextType || lastKey !== nextKey) {
		replaceWithNewNode(lastVNode, nextVNode, parentDom, lifecycle, context, isSVG, isRecycling);
		return false;
	} else {
		const nextProps = nextVNode.props || EMPTY_OBJ;

		if (isClass) {
			if ((C.patch as Function)(lastVNode, nextVNode, parentDom, lifecycle, context, isSVG, isRecycling)) {
				if (isNull(parentDom)) {
					return true;
				}
				replaceChild(
					parentDom,
					mountComponent(
						nextVNode,
						null,
						lifecycle,
						context,
						isSVG,
						(nextVNode.flags & VNodeFlags.ComponentClass) > 0
					),
					lastVNode.dom
				);
			}
		} else {
			let shouldUpdate = true;
			const lastProps = lastVNode.props;
			const nextHooks = nextVNode.ref;
			const nextHooksDefined = !isNullOrUndef(nextHooks);
			const lastInput = lastVNode.children;
			let nextInput = lastInput;

			nextVNode.dom = lastVNode.dom;
			nextVNode.children = lastInput;
			if (lastKey !== nextKey) {
				shouldUpdate = true;
			} else {
				if (nextHooksDefined && !isNullOrUndef(nextHooks.onComponentShouldUpdate)) {
					shouldUpdate = nextHooks.onComponentShouldUpdate(lastProps, nextProps);
				}
			}
			if (shouldUpdate !== false) {
				if (nextHooksDefined && !isNullOrUndef(nextHooks.onComponentWillUpdate)) {
					nextHooks.onComponentWillUpdate(lastProps, nextProps);
				}
				nextInput = nextType(nextProps, context);

				if (isInvalid(nextInput)) {
					nextInput = createVoidVNode();
				} else if (isStringOrNumber(nextInput) && nextInput !== NO_OP) {
					nextInput = createTextVNode(nextInput, null);
				} else if (isArray(nextInput)) {
					if (process.env.NODE_ENV !== 'production') {
						throwError('a valid Inferno IVNode (or null) must be returned from a component render. You may have returned an array or an invalid object.');
					}
					throwError();
				}
				if (nextInput !== NO_OP) {
					patch(lastInput, nextInput, parentDom, lifecycle, context, isSVG, isRecycling);
					nextVNode.children = nextInput;
					if (nextHooksDefined && !isNullOrUndef(nextHooks.onComponentDidUpdate)) {
						nextHooks.onComponentDidUpdate(lastProps, nextProps);
					}
					nextVNode.dom = nextInput.dom;
				}
			}
			if (nextInput.flags & VNodeFlags.Component) {
				nextInput.parentVNode = nextVNode;
			} else if (lastInput.flags & VNodeFlags.Component) {
				lastInput.parentVNode = nextVNode;
			}
		}
	}
	return false;
}

export function patchText(fiber: IFiber, text: string | number) {
	(fiber.dom as any).nodeValue = text as string;
}

// export function patchVoid(lastVNode: IVNode, nextVNode: IVNode) {
// 	nextVNode.dom = lastVNode.dom;
// }

function loop(parentDOM, context, lifecycle, isSVG, isRecycling, nextChildren: any[], childFibers: IFiber[], index: number, currentKey, currentFiberNr, fiberCount) {
	for (const len = nextChildren.length; index < len; index++) {
		const child = nextChildren[ index ];

		if (!isInvalid(child)) {
			const key = `${ currentKey }.${ index }`;

			if (isStringOrNumber(child) || isVNode(child)) {

				if (fiberCount > currentFiberNr) {
					const childFiber = childFibers[currentFiberNr++];
					if (childFiber.pos !== key) {
						replaceDOM(childFiber, parentDOM, )
					} else {
						patch(, child, parentDOM, lifecycle, context, isSVG, isRecycling);
					}
				} else {
					const newFiber = new Fiber(child, key);

					childFibers.push(newFiber);
					mount(newFiber, child, parentDOM, lifecycle, context, isSVG);
				}
			} else {
				// Array
				loop(parentDOM, context, lifecycle, isSVG, isRecycling, child, childFibers, 0, key, currentFiberNr, fiberCount);
			}
			// if (isStringOrNumber(n)) {
			// 	// String
			// 	n = createTextVNode(n, null);
			// } else if (isArray(n)) {
			// 	// Array
			// 	_normalizeVNodes(n, result, 0, key);
			//
			// 	continue;
			// }
			//
			// if (emptyKey) {
			// 	n = applyKey(key, n as VNode);
			// } else {
			// 	n = applyKeyPrefix(currentKey, n as VNode);
			// }
			//
			// result.push(n);
		}
	}
}

export function patchNonKeyedChildren(fiber: IFiber, childFibers, nextChildren, dom, lifecycle: LifecycleClass, context: Object, isSVG: boolean, isRecycling: boolean, lastFibersLength: number) {
	let fiberX = -1;
	let fiberY = 0;
	let prefix = '';
	let child = null;

	while (nextChildren.length > fiberX) {
		child = nextChildren[fiberX++];

		if (!isInvalid(child)) {
			if (isStringOrNumber(child) || isVNode(child)) {
				if (lastFibersLength > fiberCnt) {
					patch(childFibers[fiberCnt++], child, dom, lifecycle, context, isSVG, isRecycling);
				} else {
					const newFiber = new Fiber(child, prefix + );

					childFibers.push(newFiber);
					mount(newFiber, child, dom, lifecycle, context, isSVG);
				}
			} else {
				// Its' array
				prefix = `.${++fiberY}`;
				// Expensive
				// Array.prototype.splice.apply(nextChildren, [0, 1].concat(child));
			}
		}
	}

	if (fiberCnt < lastFibersLength) {
		const firstIndex = fiberCnt;

		for (; fiberCnt < lastFibersLength; fiberCnt++) {
			unmount(childFibers[fiberCnt], dom, lifecycle, false, isRecycling);
		}

		childFibers.splice(firstIndex, lastFibersLength - firstIndex); // Remove dead Fibers
	}

	// fiber.children = childFibers;
	// Fiber children contain only last valid nodes
	// last: [1, 2, null, null, null, 3, 4]
	// => [1, 2, 3, 4]
	// next: [1, 2, null, 5, 6, 7]
	// => [1, 2, 5 (mount), 6(mount); 7patch, 4remove]


	// let fiberCntr = -1;
	// for (; i < commonLength; i++) {
	// 	const nextChild = nextChildren[i];
	//
	// 	if (!isInvalid(nextChild)) {
	// 		if (isStringOrNumber(nextChild)) {
	// 			patch(childFibers[fiberCntr++], nextChild, dom, lifecycle, context, isSVG, isRecycling);
	// 		} else	if (isArray) {
	// 			patch(childFibers[fiberCntr++], nextChild, dom, lifecycle, context, isSVG, isRecycling);
	// 		} else {
	//
	// 		}
	// 	}
	// }
	//
	// if (lastChildrenLength < nextChildrenLength) {
	// 	for (i = commonLength; i < nextChildrenLength; i++) {
	// 		const nextChild = nextChildren[i];
	//
	// 		appendChild(dom, mount(nextChild, null, lifecycle, context, isSVG));
	// 	}
	// } else if (nextChildrenLength === 0) {
	// 	removeAllChildren(dom, lastChildren, lifecycle, isRecycling);
	// } else if (lastChildrenLength > nextChildrenLength) {
	// 	for (i = commonLength; i < lastChildrenLength; i++) {
	// 		unmount(lastChildren[i], dom, lifecycle, false, isRecycling);
	// 	}
	// }
}


// TODO: Should compare fibers by key
export function patchKeyedChildren(a: IVNode[], b: IVNode[], dom, lifecycle: LifecycleClass, context, isSVG: boolean, isRecycling: boolean, aLength: number, bLength: number) {
	let aEnd = aLength - 1;
	let bEnd = bLength - 1;
	let aStart = 0;
	let bStart = 0;
	let i;
	let j;
	let aNode;
	let bNode;
	let nextNode;
	let nextPos;
	let node;

	// if (aLength === 0) {
	// 	if (bLength > 0) {
	// 		mountArrayChildren(b, dom, lifecycle, context, isSVG, 0);
	// 	}
	// 	return;
	// } else if (bLength === 0) {
	// 	removeAllChildren(dom, a, lifecycle, isRecycling);
	// 	return;
	// }
	let aStartNode = a[aStart];
	let bStartNode = b[bStart];
	let aEndNode = a[aEnd];
	let bEndNode = b[bEnd];

	// Step 1
	/* eslint no-constant-condition: 0 */
	outer: while (true) {
		// Sync nodes with the same key at the beginning.
		while (aStartNode.key === bStartNode.key) {
			patch(aStartNode, bStartNode, dom, lifecycle, context, isSVG, isRecycling);
			aStart++;
			bStart++;
			if (aStart > aEnd || bStart > bEnd) {
				break outer;
			}
			aStartNode = a[aStart];
			bStartNode = b[bStart];
		}

		// Sync nodes with the same key at the end.
		while (aEndNode.key === bEndNode.key) {
			patch(aEndNode, bEndNode, dom, lifecycle, context, isSVG, isRecycling);
			aEnd--;
			bEnd--;
			if (aStart > aEnd || bStart > bEnd) {
				break outer;
			}
			aEndNode = a[aEnd];
			bEndNode = b[bEnd];
		}

		// Move and sync nodes from right to left.
		if (aEndNode.key === bStartNode.key) {
			patch(aEndNode, bStartNode, dom, lifecycle, context, isSVG, isRecycling);
			insertOrAppend(dom, bStartNode.dom, aStartNode.dom);
			aEnd--;
			bStart++;
			aEndNode = a[aEnd];
			bStartNode = b[bStart];
			continue;
		}

		// Move and sync nodes from left to right.
		if (aStartNode.key === bEndNode.key) {
			patch(aStartNode, bEndNode, dom, lifecycle, context, isSVG, isRecycling);
			nextPos = bEnd + 1;
			nextNode = nextPos < b.length ? b[nextPos].dom : null;
			insertOrAppend(dom, bEndNode.dom, nextNode);
			aStart++;
			bEnd--;
			aStartNode = a[aStart];
			bEndNode = b[bEnd];
			continue;
		}
		break;
	}

	if (aStart > aEnd) {
		if (bStart <= bEnd) {
			nextPos = bEnd + 1;
			nextNode = nextPos < b.length ? b[nextPos].dom : null;
			while (bStart <= bEnd) {
				node = b[bStart];
				bStart++;
				insertOrAppend(dom, mount(node, null, lifecycle, context, isSVG), nextNode);
			}
		}
	} else if (bStart > bEnd) {
		while (aStart <= aEnd) {
			unmount(a[aStart++], dom, lifecycle, false, isRecycling);
		}
	} else {
		aLength = aEnd - aStart + 1;
		bLength = bEnd - bStart + 1;
		const sources = new Array(bLength);

		// Mark all nodes as inserted.
		for (i = 0; i < bLength; i++) {
			sources[i] = -1;
		}
		let moved = false;
		let pos = 0;
		let patched = 0;

		// When sizes are small, just loop them through
		if ((bLength <= 4) || (aLength * bLength <= 16)) {
			for (i = aStart; i <= aEnd; i++) {
				aNode = a[i];
				if (patched < bLength) {
					for (j = bStart; j <= bEnd; j++) {
						bNode = b[j];
						if (aNode.key === bNode.key) {
							sources[j - bStart] = i;

							if (pos > j) {
								moved = true;
							} else {
								pos = j;
							}
							patch(aNode, bNode, dom, lifecycle, context, isSVG, isRecycling);
							patched++;
							a[i] = null as any;
							break;
						}
					}
				}
			}
		} else {
			const keyIndex = new Map();

			// Map keys by their index in array
			for (i = bStart; i <= bEnd; i++) {
				keyIndex.set(b[i].key, i);
			}

			// Try to patch same keys
			for (i = aStart; i <= aEnd; i++) {
				aNode = a[i];

				if (patched < bLength) {
					j = keyIndex.get(aNode.key);

					if (!isUndefined(j)) {
						bNode = b[j];
						sources[j - bStart] = i;
						if (pos > j) {
							moved = true;
						} else {
							pos = j;
						}
						patch(aNode, bNode, dom, lifecycle, context, isSVG, isRecycling);
						patched++;
						a[i] = null as any;
					}
				}
			}
		}
		// fast-path: if nothing patched remove all old and add all new
		if (aLength === a.length && patched === 0) {
			removeAllChildren(dom, a, lifecycle, isRecycling);
			while (bStart < bLength) {
				node = b[bStart];
				bStart++;
				insertOrAppend(dom, mount(node, null, lifecycle, context, isSVG), null);
			}
		} else {
			i = aLength - patched;
			while (i > 0) {
				aNode = a[aStart++];
				if (!isNull(aNode)) {
					unmount(aNode, dom, lifecycle, true, isRecycling);
					i--;
				}
			}
			if (moved) {
				const seq = lis_algorithm(sources);
				j = seq.length - 1;
				for (i = bLength - 1; i >= 0; i--) {
					if (sources[i] === -1) {
						pos = i + bStart;
						node = b[pos];
						nextPos = pos + 1;
						nextNode = nextPos < b.length ? b[nextPos].dom : null;
						insertOrAppend(dom, mount(node, dom, lifecycle, context, isSVG), nextNode);
					} else {
						if (j < 0 || i !== seq[j]) {
							pos = i + bStart;
							node = b[pos];
							nextPos = pos + 1;
							nextNode = nextPos < b.length ? b[nextPos].dom : null;
							insertOrAppend(dom, node.dom, nextNode);
						} else {
							j--;
						}
					}
				}
			} else if (patched !== bLength) {
				// when patched count doesn't match b length we need to insert those new ones
				// loop backwards so we can use insertBefore
				for (i = bLength - 1; i >= 0; i--) {
					if (sources[i] === -1) {
						pos = i + bStart;
						node = b[pos];
						nextPos = pos + 1;
						nextNode = nextPos < b.length ? b[nextPos].dom : null;
						insertOrAppend(dom, mount(node, null, lifecycle, context, isSVG), nextNode);
					}
				}
			}
		}
	}
}

// // https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function lis_algorithm(arr: number[]): number[] {
	const p = arr.slice(0);
	const result: number[] = [0];
	let i;
	let j;
	let u;
	let v;
	let c;
	const len = arr.length;

	for (i = 0; i < len; i++) {
		const arrI = arr[i];

		if (arrI === -1) {
			continue;
		}

		j = result[result.length - 1];
		if (arr[j] < arrI) {
			p[i] = j;
			result.push(i);
			continue;
		}

		u = 0;
		v = result.length - 1;

		while (u < v) {
			c = ((u + v) / 2) | 0;
			if (arr[result[c]] < arrI) {
				u = c + 1;
			} else {
				v = c;
			}
		}

		if (arrI < arr[result[u]]) {
			if (u > 0) {
				p[i] = result[u - 1];
			}
			result[u] = i;
		}
	}

	u = result.length;
	v = result[u - 1];

	while (u-- > 0) {
		result[u] = v;
		v = p[v];
	}

	return result;
}

export function isAttrAnEvent(attr: string): boolean {
	return attr[0] === 'o' && attr[1] === 'n';
}

export function patchProp(prop, lastValue, nextValue, dom: Element, isSVG: boolean, hasControlledValue: boolean) {
	if (lastValue !== nextValue) {
		if (skipProps.has(prop) || (hasControlledValue && prop === 'value')) {
			return;
		} else if (booleanProps.has(prop)) {
			prop = prop === 'autoFocus' ? prop.toLowerCase() : prop;
			dom[prop] = !!nextValue;
		} else if (strictProps.has(prop)) {
			const value = isNullOrUndef(nextValue) ? '' : nextValue;

			if (dom[prop] !== value) {
				dom[prop] = value;
			}
		} else if (isAttrAnEvent(prop)) {
			patchEvent(prop, lastValue, nextValue, dom);
		} else if (isNullOrUndef(nextValue)) {
			dom.removeAttribute(prop);
		} else if (prop === 'style') {
			patchStyle(lastValue, nextValue, dom);
		} else if (prop === 'dangerouslySetInnerHTML') {
			const lastHtml = lastValue && lastValue.__html;
			const nextHtml = nextValue && nextValue.__html;

			if (lastHtml !== nextHtml) {
				if (!isNullOrUndef(nextHtml)) {
					dom.innerHTML = nextHtml;
				}
			}
		} else {
			// We optimize for NS being boolean. Its 99.9% time false
			if (isSVG && namespaces.has(prop)) {
				// If we end up in this path we can read property again
				dom.setAttributeNS(namespaces.get(prop) as string, prop, nextValue);
			} else {
				dom.setAttribute(prop, nextValue);
			}
		}
	}
}

export function patchEvent(name: string, lastValue, nextValue, dom) {
	if (lastValue !== nextValue) {
		if (delegatedEvents.has(name)) {
			handleEvent(name, lastValue, nextValue, dom);
		} else {
			const nameLowerCase = name.toLowerCase();
			const domEvent = dom[nameLowerCase];
			// if the function is wrapped, that means it's been controlled by a wrapper
			if (domEvent && domEvent.wrapped) {
				return;
			}
			if (!isFunction(nextValue) && !isNullOrUndef(nextValue)) {
				const linkEvent = nextValue.event;

				if (linkEvent && isFunction(linkEvent)) {
					dom[nameLowerCase] = function (e) {
						C.rendering = true;
						linkEvent(nextValue.data, e);
						if (isFunction(C.flush)) {
							C.flush();
						}
						C.rendering = false;
					};
				} else {
					if (process.env.NODE_ENV !== 'production') {
						throwError(`an event on a VNode "${ name }". was not a function or a valid linkEvent.`);
					}
					throwError();
				}
			} else {
				dom[nameLowerCase] = function (event) {
					C.rendering = true;
					nextValue(event);
					if (isFunction(C.flush)) {
						C.flush();
					}
					C.rendering = false;
				};
			}
		}
	}
}

// We are assuming here that we come from patchProp routine
// -nextAttrValue cannot be null or undefined
export function patchStyle(lastAttrValue: string | {}, nextAttrValue: string | {}, dom) {
	const domStyle = dom.style;

	if (isString(nextAttrValue)) {
		domStyle.cssText = nextAttrValue;
		return;
	}

	for (const style in nextAttrValue) {
		// do not add a hasOwnProperty check here, it affects performance
		const value = nextAttrValue[style];

		if (!isNumber(value) || isUnitlessNumber.has(style)) {
			domStyle[style] = value;
		} else {
			domStyle[style] = value + 'px';
		}
	}

	if (!isNullOrUndef(lastAttrValue) && !isString(lastAttrValue)) {
		for (const style in lastAttrValue) {
			if (isNullOrUndef(nextAttrValue[style])) {
				domStyle[style] = '';
			}
		}
	}
}

function removeProp(prop: string, lastValue, dom, nextFlags: number) {
	if (prop === 'value') {
		// When removing value of select element, it needs to be set to null instead empty string, because empty string is valid value for option which makes that option selected
		// MS IE/Edge don't follow html spec for textArea and input elements and we need to set empty string to value in those cases to avoid "null" and "undefined" texts
		dom.value = nextFlags & VNodeFlags.SelectElement ? null : '';
	} else if (prop === 'style') {
		dom.removeAttribute('style');
	} else if (isAttrAnEvent(prop)) {
		handleEvent(prop, lastValue, null, dom);
	} else {
		dom.removeAttribute(prop);
	}
}
