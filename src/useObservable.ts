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

const strategy: 'A' | 'B' = 'A'

const noInitialValue = Symbol('noInitialValue')
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
  const [initial, setInitial] = useState(true)
  const testRef = useRef<any[]>([])
  const subscribedRef = useRef(0)
  const syncSnapshotSetterRef = useRef<(() => void) | null>(null)
  const [getSnapshot, subscribe] = useMemo(() => {
    const record = getOrCreateStore(observable, getValue(initialValue))!

    let teardownSyncSnapshotSetter: (() => void) | undefined
    // console.warn('ONE', record.currentValue)
    // const syncSnapshotSubscription = record.observable.subscribe()
    // console.warn('TWO', record.currentValue)
    // syncSnapshotSubscription.unsubscribe()
    // console.warn('THREE', record.currentValue)
    /*
    const syncSnapshotSubscription = record.observable.subscribe()
    teardownSyncSnapshotSetter => {
      syncSnapshotSubscription.unsubscribe()
      teardownSyncSnapshotSetter = undefined
    }
    // */
    /*
    if (syncSnapshotSetterRef.current) {
      // syncSnapshotSetterRef.current()
    }
    const syncSnapshotSubscription = record.observable.subscribe()
    syncSnapshotSetterRef.current = () => {
      syncSnapshotSubscription.unsubscribe()
      syncSnapshotSetterRef.current = null
    }
    // */
    return [
      function getSnapshot() {
        // console.count('getOrCreateStore.getSnapshot')
        // console.log('currentValue', record.currentValue, {teardownSyncSnapshotSetter})
        // if (teardownSyncSnapshotSetter) {
        // teardownSyncSnapshotSetter()
        // }
        return record.currentValue
      },
      function subscribe(callback: () => void) {
        // if (teardownSyncSnapshotSetter) {
        // teardownSyncSnapshotSetter()
        //}
        console.count('getOrCreateStore.subscribe')
        const sub = record.observable.subscribe(callback)
        // ++subscribedRef.current
        // console.log({subscribedRef})
        // if (syncSnapshotSetterRef.current) {
        // syncSnapshotSetterRef.current()
        // }
        return () => {
          console.count('getOrCreateStore.unsubscribe')
          sub.unsubscribe()
          // --subscribedRef.current
          // console.log({subscribedRef})
        }
      },
    ]
  }, [observable])
  // To set the initial observable value in sync we setup and call a subscription during render,
  // this is only necessary on the very first render for the lifecycle of the component.
  // Which hook lets us run initial logic exactly once, and is ignored on rerenders? `React.useState(() => callback)`
  // This extra logic is worth the trouble as it means that the value returned by this hook is always coming from the observable.`

  /*
  useMemo(() => {
    console.log('0. useMemo')
    if (unsubscribeRef.current) {
      console.log('0. unsubscribeRef.current()')
      unsubscribeRef.current()
    }
    // Calling subscribe triggers the observable setup and sets `record.currentValue`
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const unsubscribe = subscribe(() => {
      console.log('X. subscribed!')
    })
    unsubscribeRef.current = () => {
      console.log('3. unsubscribe(')
      unsubscribe()
      unsubscribeRef.current = null
    }
  }, [subscribe])
  // */

  /*
  useIsomorphicEffect(() => {
    console.log(subscribedRef)
    console.log('1. useEffect')
    // console.log(unsubscribeRef.current)
    if (syncSnapshotSetterRef.current) {
      console.log('2. syncSnapshotSetterRef.current')
      // return () => {
      console.log('3. useIsomorphicEffect.unsubscribeRef.current')
      // @ts-ignore
      // syncSnapshotSetterRef.current()
      // }
    }
  }, [observable])
  // */

  if (strategy === 'A') {
    useIsomorphicEffect(() => {
      return () => {
        getOrCreateStore(observable, getValue(initialValue))!.subscription?.unsubscribe()
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
