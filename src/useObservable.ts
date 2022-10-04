import {Observable, Subscription} from 'rxjs'
import {DependencyList, useEffect, useMemo, useRef} from 'react'
import {useSyncExternalStore} from 'use-sync-external-store/shim'
import {shareReplay, tap} from 'rxjs/operators'

function getValue<T>(value: T): T extends () => infer U ? U : T {
  return typeof value === 'function' ? value() : value
}

interface CacheRecord<T> {
  subscription?: Subscription
  observable: Observable<T>
  currentValue: T
}

const strategy: 'A' | 'B' | 'C' | 'D' = 'A'

const cache = new WeakMap<Observable<any>, CacheRecord<any>>()
function getOrCreateStore<T>(inputObservable: Observable<T>, initialValue: T) {
  if (!cache.has(inputObservable)) {
    const entry: Partial<CacheRecord<T>> = {currentValue: initialValue}
    entry.observable = inputObservable.pipe(
      shareReplay({refCount: true, bufferSize: 1}),
      tap(value => (entry.currentValue = value)),
    )

    // Eagerly subscribe to sync set `entry.currentValue` to what the observable return
    if (strategy === 'A' || strategy === 'B') {
      if (entry.currentValue === undefined) {
        entry.subscription = entry.observable.subscribe()
      }
    }

    cache.set(inputObservable, entry as CacheRecord<T>)
  }
  return cache.get(inputObservable)
}

export function useObservable<T>(observable: Observable<T>): T | undefined
export function useObservable<T>(observable: Observable<T>, initialValue: T): T
export function useObservable<T>(observable: Observable<T>, initialValue: () => T): T
export function useObservable<T>(observable: Observable<T>, initialValue?: T | (() => T)) {
  const [getSnapshot, subscribe] = useMemo<
    [() => T, Parameters<typeof useSyncExternalStore>[0]]
  >(() => {
    const record = getOrCreateStore(observable, getValue(initialValue))!

    return [
      function getSnapshot() {
        if (strategy === 'C' && initialValue === undefined && !record.subscription) {
          // Sync subscribe and update the initial value when React asks for the first snapshot
          record.subscription = record.observable.subscribe()
          // With the initial value set time to unsubscribe
          record.subscription.unsubscribe()
        }
        if (strategy === 'D' && initialValue === undefined && !record.subscription) {
          // Sync subscribe and update the initial value when React asks for the first snapshot
          record.subscription = record.observable.subscribe()
          // The subscription will be closed when the store is subscribed to
        }
        return record.currentValue
      },
      function subscribe(callback: () => void) {
        if (
          (strategy === 'B' || strategy === 'D') &&
          record.subscription &&
          !record.subscription.closed
        ) {
          record.subscription.unsubscribe()
        }
        // record.subscription.unsubscribe()
        const sub = record.observable.subscribe(() => callback())
        return () => {
          sub.unsubscribe()
        }
      },
    ]
  }, [observable])

  if (strategy === 'A') {
    const shouldRestoreSubscriptionRef = useRef(false)
    useEffect(() => {
      const store = getOrCreateStore(observable, getValue(initialValue))!
      if (shouldRestoreSubscriptionRef.current) {
        if (store.subscription?.closed) {
          store.subscription = store.observable.subscribe()
        }
        shouldRestoreSubscriptionRef.current = false
      }

      return () => {
        shouldRestoreSubscriptionRef.current = !store.subscription?.closed
        store.subscription?.unsubscribe()
      }
    }, [observable, initialValue])
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
