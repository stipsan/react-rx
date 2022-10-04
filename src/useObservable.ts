import {Observable, Subscription} from 'rxjs'
import {DependencyList, useEffect, useMemo, useRef, useState} from 'react'
import {useSyncExternalStore} from 'use-sync-external-store/shim'
import {shareReplay, tap} from 'rxjs/operators'
import {useIsomorphicEffect} from './useIsomorphicEffect'

function getValue<T>(value: T): T extends () => infer U ? U : T {
  return typeof value === 'function' ? value() : value
}

interface CacheRecord<T> {
  subscription: Subscription
  observable: Observable<T>
  currentValue: T
}

const strategy: 'A' | 'B' = 'B'

const cache = new WeakMap<Observable<any>, CacheRecord<any>>()
function getOrCreateStore<T>(inputObservable: Observable<T>, initialValue: T) {
  if (!cache.has(inputObservable)) {
    const entry: Partial<CacheRecord<T>> = {currentValue: initialValue}
    entry.observable = inputObservable.pipe(
      shareReplay({refCount: true, bufferSize: 1}),
      tap(value => (entry.currentValue = value)),
    )

    if (strategy === 'A') {
      entry.subscription = entry.observable.subscribe()
    } else if (strategy === 'B') {
      const syncInitialCurrentValue = entry.observable.subscribe()
      syncInitialCurrentValue.unsubscribe()
    }

    cache.set(inputObservable, entry as CacheRecord<T>)
  }
  return cache.get(inputObservable)
}

export function useObservable<T>(observable: Observable<T>): T | undefined
export function useObservable<T>(observable: Observable<T>, initialValue: T): T
export function useObservable<T>(observable: Observable<T>, initialValue: () => T): T
export function useObservable<T>(observable: Observable<T>, initialValue?: T | (() => T)) {
  const [getSnapshot, subscribe] = useMemo(() => {
    const record = getOrCreateStore(observable, getValue(initialValue))!
    return [
      function getSnapshot() {
        return record.currentValue
      },
      function subscribe(callback: () => void) {
        console.count('getOrCreateStore.subscribe')
        const sub = record.observable.subscribe(
          // @ts-ignore
          strategy === 'A' ? next => callback(next) : callback,
        )
        return () => {
          console.count('getOrCreateStore.unsubscribe')
          sub.unsubscribe()
        }
      },
    ]
  }, [observable])

  if (strategy === 'A') {
    useIsomorphicEffect(() => {
      return () => {
        getOrCreateStore(observable, getValue(initialValue))!.subscription.unsubscribe()
      }
    }, [observable])
  }

  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useMemoObservable<T>(
  observableOrFactory: Observable<T> | (() => Observable<T>),
  deps: DependencyList,
): T | undefined
export function useMemoObservable<T>(
  observableOrFactory: Observable<T> | (() => Observable<T>),
  deps: DependencyList,
  initialValue: T | (() => T),
): T
export function useMemoObservable<T>(
  observableOrFactory: Observable<T> | (() => Observable<T>),
  deps: DependencyList,
  initialValue?: T | (() => T),
) {
  return useObservable(
    useMemo(() => getValue(observableOrFactory), deps),
    initialValue,
  )
}
