/// <reference types="vite/client" />

declare module '*.png' {
  const value: string
  export default value
}

declare module '*.jpg' {
  const value: string
  export default value
}

declare module '*.jpeg' {
  const value: string
  export default value
}

declare module '*.svg' {
  const value: string
  export default value
}

declare module '*.gif' {
  const value: string
  export default value
}

declare module '*.webp' {
  const value: string
  export default value
}

// Type declarations for packages that may not have types
declare module 'browser-level' {
  export class BrowserLevel {
    constructor(name: string)
    [key: string]: any
  }
}

declare module 'localforage' {
  const localforage: {
    getItem<T = any>(key: string): Promise<T | null>
    setItem<T = any>(key: string, value: T): Promise<T>
    removeItem(key: string): Promise<void>
    clear(): Promise<void>
    length(): Promise<number>
    key(index: number): Promise<string | null>
    keys(): Promise<string[]>
    iterate<T>(iteratee: (value: any, key: string, iterationNumber: number) => T | void): Promise<T | void>
  }
  export default localforage
}


