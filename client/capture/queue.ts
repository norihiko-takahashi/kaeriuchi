/**
 * 決まった数ずつ並べて処理する（U3：枠を2枚ずつ読み取りに送る・nfr-design.md §5）。
 * 1つが失敗しても、ほかは続ける。stop が true を返したら、まだ始めていないものは始めない。
 */
export async function runLimited<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
  onSettled: (index: number, result: PromiseSettledResult<R>) => void,
  stop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) {
      const i = next++;
      try {
        onSettled(i, { status: "fulfilled", value: await work(items[i], i) });
      } catch (reason) {
        onSettled(i, { status: "rejected", reason });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}
