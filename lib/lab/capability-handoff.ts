export async function deliverCurrentHandoff<T>({
  create,
  isCurrent,
  deliver,
}: {
  create: () => Promise<T>;
  isCurrent: () => boolean;
  deliver: (value: T) => void;
}) {
  const value = await create();
  if (!isCurrent()) return false;
  deliver(value);
  return true;
}
