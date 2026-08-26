import {
    Router,
    StreamSink,
    getTotalRegistrations
} from '../../lib/Lib';

afterEach(() => {
    if (getTotalRegistrations() != 0) {
        throw new Error('listeners were not deregistered');
    }
});

test('should test Router', (done) => {
    const out: string[] = [];
    const sa = new StreamSink<number[]>();
    const router = new Router(sa, x => x);
    const sb = router.filterMatches(1).mapTo("a");
    const sc = router.filterMatches(2).mapTo("b");
    const sd = router.filterMatches(3).mapTo("c");
    const kill = sb.merge(sc, (x,y) => x+y).merge(sd, (x,y) => x+y).listen(x => out.push(x));
    sa.send([1]);
    sa.send([2]);
    sa.send([3]);
    sa.send([1,2,3]);
    sa.send([1,2,3,1,2])
    kill();
    expect(out).toEqual(["a", "b", "c", "abc", "abc"]);
    done();
});
