export function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getRoleLabel(role: string) {
  if (role === 'admin') return 'Administrator';
  return 'Contributor';
}

export function avatarDisplay(avatar: string, name: string, size = 'md') {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  if (avatar?.startsWith('http')) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${dim} rounded-md object-cover border border-line shadow-xs`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-md bg-soft text-ink font-bold border border-line flex items-center justify-center shadow-xs`}
    >
      {avatar || name.charAt(0).toUpperCase()}
    </div>
  );
}
