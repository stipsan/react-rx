import { useEffect, useMemo, useRef } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import { shareReplay, tap } from 'rxjs/operators';
function getValue(value) {
    return typeof value === 'function' ? value() : value;
}
var cache = new WeakMap();
function getOrCreateStore(inputObservable, initialValue) {
    if (!cache.has(inputObservable)) {
        var entry_1 = { currentValue: initialValue };
        entry_1.observable = inputObservable.pipe(shareReplay({ refCount: true, bufferSize: 1 }), tap(function (value) { return (entry_1.currentValue = value); }));
        // Eagerly subscribe to sync set `entry.currentValue` to what the observable returns
        // @TODO: perf opt opportunity: don't setup sync subscription initialValue is !== undefined
        // Why not check `initialValue`? Because it might change during re-renders, but here we're only concerned with the first run
        // if (entry.currentValue === undefined) {
        entry_1.subscription = entry_1.observable.subscribe();
        // }
        cache.set(inputObservable, entry_1);
    }
    return cache.get(inputObservable);
}
export function useObservable(observable, initialValue) {
    var _a = useMemo(function () {
        var record = getOrCreateStore(observable, getValue(initialValue));
        return [
            function getSnapshot() {
                // @TODO: perf opt opportunity: we could do `record.subscription.unsubscribe()` here to clear up some memory, as this subscription is only needed to provide a sync initialValue.
                return record.currentValue;
            },
            function subscribe(callback) {
                // @TODO: perf opt opportunity: we could do `record.subscription.unsubscribe()` here as we only need 1 subscription active to keep the observer alive
                var sub = record.observable.subscribe(function () { return callback(); });
                return function () {
                    sub.unsubscribe();
                };
            },
        ];
    }, [observable]), getSnapshot = _a[0], subscribe = _a[1];
    var shouldRestoreSubscriptionRef = useRef(false);
    useEffect(function () {
        var store = getOrCreateStore(observable, getValue(initialValue));
        if (shouldRestoreSubscriptionRef.current) {
            if (store.subscription.closed) {
                store.subscription = store.observable.subscribe();
            }
            shouldRestoreSubscriptionRef.current = false;
        }
        return function () {
            // React StrictMode will call effects as `setup + teardown + setup` thus we can't trust this callback as "react is about to unmount"
            // Tracking this ref lets us set the subscription back up on the next `setup` call if needed, and if it really did unmounted then all is well
            shouldRestoreSubscriptionRef.current = !store.subscription.closed;
            store.subscription.unsubscribe();
        };
    }, [observable]);
    return useSyncExternalStore(subscribe, getSnapshot);
}
export function useMemoObservable(observableOrFactory, deps, initialValue) {
    return useObservable(useMemo(function () { return getValue(observableOrFactory); }, deps), initialValue);
}
