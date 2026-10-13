export const newestForumComments = <Comment extends { id: number; date: string }>(comments: readonly Comment[]): Comment[] => {
  const timestamp = (date: string): number => {
    const value = Date.parse(date);
    return Number.isFinite(value) ? value : 0;
  };
  return [...comments].sort((left, right) => timestamp(right.date) - timestamp(left.date) || right.id - left.id);
};
