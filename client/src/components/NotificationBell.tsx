import { useEffect, useRef, useState, useCallback } from "react";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  markAllNotificationsRead,
} from "../api";
import { useOutsideClick } from "../hooks/useOutsideClick";
import type { Notification } from "../types/marketplace";

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function formatNotifDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // ignore polling errors
    }
  }, []);

  // Initial fetch + poll every 60s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const openDropdown = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 15 });
      setNotifications(data.items);
      // Mark all visible as read
      const unreadIds = data.items.filter((n) => !n.isRead).map((n) => n.id);
      if (unreadIds.length > 0) {
        await markNotificationsRead(unreadIds);
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
    } else {
      openDropdown();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  useOutsideClick(ref, () => setOpen(false));

  const badge = unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="navbar-icon-btn"
        onClick={handleToggle}
        aria-label={`Notifications${badge ? ` (${unreadCount} non lues)` : ""}`}
        aria-expanded={open}
      >
        <BellIcon />
        {badge && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "var(--color-error, #ef4444)",
              color: "#fff",
              fontSize: "10px",
              fontWeight: 700,
              lineHeight: 1,
              minWidth: "16px",
              height: "16px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "340px",
            maxHeight: "420px",
            overflowY: "auto",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3))",
            zIndex: 200,
          }}
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <span style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)" }}>
              Notifications
            </span>
            {notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleMarkAllRead}
                style={{ padding: "2px 8px", fontSize: "var(--text-xs)" }}
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              Chargement…
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              Aucune notification
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "1px solid var(--color-border)",
                    background: n.isRead ? "transparent" : "var(--color-primary-subtle, rgba(99,102,241,0.06))",
                    display: "flex",
                    gap: "var(--space-2)",
                    alignItems: "flex-start",
                  }}
                >
                  {!n.isRead && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "var(--color-primary)",
                        marginTop: "5px",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", lineHeight: 1.3 }}>
                      {n.title}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                      {n.body}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                      {formatNotifDate(n.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
