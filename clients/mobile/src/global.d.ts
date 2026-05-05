/**
 * Global type augmentation — React 19 + RN compatibility.
 *
 * React 19 removed the global `JSX` namespace; tsx files referencing
 * `JSX.Element` directly (without `import type {JSX} from 'react'`) break.
 *
 * Re-export `JSX` from react into the global scope so existing tsx idioms
 * compile unchanged.
 */

import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
