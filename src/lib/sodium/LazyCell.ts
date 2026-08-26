import { Lazy } from "./Lazy";
import { Cell } from "./Cell";
import { Stream } from "./Stream";
import { Transaction } from "./Transaction";

/**
 * Flag recording whether the lazy initial value has been forced.
 * <p>
 * This is tracked explicitly rather than by testing the cell's value against null,
 * because null is a legitimate value for a cell to hold.
 */
const forced : unique symbol = Symbol.for("nz.sodium.forced");

export class LazyCell<A> extends Cell<A> {
    private [forced] = false;

    constructor(lazyInitValue : Lazy<A>, str? : Stream<A>) {
        super(null, null);
        Transaction.run(() => {
            if (str)
                this.setStream(str);
            this.lazyInitValue = lazyInitValue;
        });
    }

    sampleNoTrans__() : A {  // Override
        if (!this[forced] && this.lazyInitValue != null) {
            this.value = this.lazyInitValue.get();
            this.lazyInitValue = null;
            this[forced] = true;
        }
        return this.value;
    }
}
