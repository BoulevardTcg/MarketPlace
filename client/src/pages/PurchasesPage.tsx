import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getMyPurchases, getMyOrders, getAccessToken } from "../api";
import type { PurchaseOrder, PurchaseOrderStatus } from "../types/marketplace";
import { ORDER_STATUS_LABELS } from "../types/marketplace";
import { PageHeader, PriceDisplay, EmptyState, ErrorState, Skeleton } from "../components";

type Tab = "purchases" | "orders";

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  PENDING: "var(--color-warning, #f59e0b)",
  COMPLETED: "var(--color-success, #10b981)",
  CANCELLED: "var(--color-text-muted)",
  FAILED: "var(--color-error, #ef4444)",
};

function OrderList({
  fetch,
}: {
  fetch: (cursor?: string) => Promise<{ items: PurchaseOrder[]; nextCursor: string | null }>;
}) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      const isFirst = !cursor;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const data = await fetch(cursor);
        if (isFirst) {
          setOrders(data.items);
        } else {
          setOrders((prev) => [...prev, ...data.items]);
        }
        setNextCursor(data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fetch],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="my-listings-row">
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="badge" />
            <Skeleton variant="text" width="15%" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => load()} />;
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        title="Aucune commande"
        description="Vous n'avez pas encore de commandes."
      />
    );
  }

  return (
    <>
      <ul className="my-listings-list" role="list">
        {orders.map((order) => (
          <li key={order.id} className="my-listings-item">
            <div className="my-listings-item-main">
              {order.listing ? (
                <Link
                  to={`/marketplace/${order.listingId}`}
                  className="my-listings-item-title"
                >
                  {order.listing.title}
                </Link>
              ) : (
                <span className="my-listings-item-title">Commande #{order.id.slice(0, 8)}</span>
              )}
              <span className="my-listings-item-meta">
                <PriceDisplay cents={order.priceCents} currency={order.currency} size="sm" />
                {" · "}
                {new Date(order.createdAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="my-listings-item-actions">
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--font-semibold)",
                  color: STATUS_COLORS[order.status],
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${STATUS_COLORS[order.status]}`,
                }}
              >
                {ORDER_STATUS_LABELS[order.status]}
              </span>
              {order.listing && (
                <Link
                  to={`/marketplace/${order.listingId}`}
                  className="btn btn-sm btn-ghost"
                >
                  Voir
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {nextCursor && (
        <div className="my-listings-load-more">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loadingMore}
            onClick={() => load(nextCursor)}
          >
            {loadingMore ? "Chargement…" : "Voir plus"}
          </button>
        </div>
      )}
    </>
  );
}

export function PurchasesPage() {
  const [tab, setTab] = useState<Tab>("purchases");
  const hasAuth = !!getAccessToken();

  const fetchPurchases = useCallback(
    (cursor?: string) => getMyPurchases({ cursor, limit: 20 }),
    [],
  );
  const fetchOrders = useCallback(
    (cursor?: string) => getMyOrders({ cursor, limit: 20 }),
    [],
  );

  if (!hasAuth) {
    return (
      <section className="card card-body">
        <PageHeader
          title="Mes achats"
          subtitle="Connectez-vous pour voir vos achats et commandes reçues."
          action={
            <Link to="/connexion" className="btn btn-primary">
              Se connecter
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="my-listings-page">
      <PageHeader
        title="Achats & Commandes"
        subtitle="Vos achats effectués et commandes reçues en tant que vendeur."
      />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-1)",
          marginBottom: "var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {(
          [
            { key: "purchases", label: "Mes achats" },
            { key: "orders", label: "Commandes reçues" },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              background: "none",
              border: "none",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--text-sm)",
              fontWeight: tab === key ? "var(--font-semibold)" : "var(--font-normal)",
              color: tab === key ? "var(--color-primary)" : "var(--color-text-muted)",
              borderBottom: tab === key ? "2px solid var(--color-primary)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: "-1px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "purchases" && <OrderList fetch={fetchPurchases} />}
      {tab === "orders" && <OrderList fetch={fetchOrders} />}
    </section>
  );
}
