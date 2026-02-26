import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchWithAuth, getAccessToken } from "../api";
import {
  buyListing,
  getListingShipping,
  setListingShipping,
  getListingQuestions,
  askListingQuestion,
  answerListingQuestion,
  getSellerReviewSummary,
  getSellerReviews,
  createReview,
} from "../api";
import { useAuth } from "../hooks/useAuth";
import type { Listing, ListingShipping, ListingQuestion, SellerReview, SellerReviewSummary, ShippingMethod } from "../types/marketplace";
import {
  GAME_LABELS,
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  SHIPPING_METHOD_LABELS,
} from "../types/marketplace";
import { PriceDisplay, PriceDeltaBadge, Badge, Skeleton, ErrorState, StarRating } from "../components";

const SHIPPING_METHODS: ShippingMethod[] = ["PICKUP", "COLISSIMO", "MONDIAL_RELAY", "LETTRE_SUIVIE", "OTHER"];

// ─── Shipping Section ─────────────────────────────────────────────────────────

function ShippingSection({ listingId, isOwner, listingStatus }: { listingId: string; isOwner: boolean; listingStatus: string }) {
  const [shipping, setShipping] = useState<ListingShipping | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    method: "COLISSIMO" as ShippingMethod,
    isFree: false,
    priceCents: "",
    estimatedDays: "",
    description: "",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getListingShipping(listingId)
      .then((data) => { if (!cancelled) setShipping(data.shipping); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listingId]);

  useEffect(() => {
    if (shipping) {
      setForm({
        method: shipping.method,
        isFree: shipping.isFree,
        priceCents: shipping.priceCents ? String(shipping.priceCents / 100) : "",
        estimatedDays: shipping.estimatedDays ?? "",
        description: shipping.description ?? "",
      });
    }
  }, [shipping]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await setListingShipping(listingId, {
        method: form.method,
        isFree: form.isFree,
        priceCents: form.isFree ? undefined : form.priceCents ? Math.round(parseFloat(form.priceCents) * 100) : undefined,
        estimatedDays: form.estimatedDays || undefined,
        description: form.description || undefined,
      });
      setShipping(data.shipping);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const canEdit = isOwner && (listingStatus === "DRAFT" || listingStatus === "PUBLISHED");

  return (
    <>
      <hr className="divider" />
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
          <h2 style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", margin: 0 }}>Livraison</h2>
          {canEdit && !editing && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              {shipping ? "Modifier" : "Ajouter"}
            </button>
          )}
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div>
              <label className="label">Mode d'envoi</label>
              <select
                className="select"
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as ShippingMethod }))}
              >
                {SHIPPING_METHODS.map((m) => (
                  <option key={m} value={m}>{SHIPPING_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.isFree}
                onChange={(e) => setForm((f) => ({ ...f, isFree: e.target.checked }))}
              />
              <span style={{ fontSize: "var(--text-sm)" }}>Livraison gratuite</span>
            </label>
            {!form.isFree && (
              <div>
                <label className="label">Frais de port (€)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="ex: 3.50"
                  min="0"
                  step="0.01"
                  value={form.priceCents}
                  onChange={(e) => setForm((f) => ({ ...f, priceCents: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="label">Délai estimé (optionnel)</label>
              <input
                type="text"
                className="input"
                placeholder="ex: 2-3 jours"
                maxLength={50}
                value={form.estimatedDays}
                onChange={(e) => setForm((f) => ({ ...f, estimatedDays: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Description (optionnel)</label>
              <input
                type="text"
                className="input"
                placeholder="Précisions sur l'envoi"
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            {saveError && <p className="alert alert-error" style={{ margin: 0 }}>{saveError}</p>}
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                Annuler
              </button>
            </div>
          </div>
        ) : shipping ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ color: "var(--color-text)", fontWeight: "var(--font-medium)" }}>
              {SHIPPING_METHOD_LABELS[shipping.method]}
            </span>
            <span>
              {shipping.isFree
                ? "Livraison gratuite"
                : shipping.priceCents
                ? `${(shipping.priceCents / 100).toFixed(2)} €`
                : "Prix à définir"}
            </span>
            {shipping.estimatedDays && <span>Délai : {shipping.estimatedDays}</span>}
            {shipping.description && <span>{shipping.description}</span>}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            Aucune information de livraison
          </p>
        )}
      </div>
    </>
  );
}

// ─── Q&A Section ──────────────────────────────────────────────────────────────

function QASection({ listingId, isOwner, isAuthenticated }: { listingId: string; isOwner: boolean; isAuthenticated: boolean }) {
  const [questions, setQuestions] = useState<ListingQuestion[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [askText, setAskText] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    const isFirst = !cursor;
    if (isFirst) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await getListingQuestions(listingId, { cursor, limit: 10 });
      if (isFirst) setQuestions(data.items);
      else setQuestions((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [listingId]);

  useEffect(() => { load(); }, [load]);

  const handleAsk = async () => {
    if (!askText.trim() || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      await askListingQuestion(listingId, askText.trim());
      setAskText("");
      load(); // Refresh list
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAsking(false);
    }
  };

  const handleAnswer = async (questionId: string) => {
    const answer = answerTexts[questionId]?.trim();
    if (!answer || answeringId === questionId) return;
    setAnsweringId(questionId);
    setAnswerError(null);
    try {
      await answerListingQuestion(listingId, questionId, answer);
      setAnswerTexts((prev) => ({ ...prev, [questionId]: "" }));
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? { ...q, answer, answeredAt: new Date().toISOString() }
            : q,
        ),
      );
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAnsweringId(null);
    }
  };

  return (
    <>
      <hr className="divider" />
      <div>
        <h2 style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", margin: "0 0 var(--space-3)" }}>
          Questions ({questions.length}{nextCursor ? "+" : ""})
        </h2>

        {loading ? (
          <Skeleton variant="text" width="80%" />
        ) : questions.length === 0 ? (
          <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            Aucune question pour l'instant.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            {questions.map((q) => (
              <div key={q.id} style={{ borderLeft: "2px solid var(--color-border)", paddingLeft: "var(--space-3)" }}>
                <p style={{ margin: "0 0 4px", fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                  Q : {q.question}
                </p>
                {q.answer ? (
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                    R : {q.answer}
                  </p>
                ) : isOwner ? (
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Votre réponse…"
                      value={answerTexts[q.id] ?? ""}
                      onChange={(e) => setAnswerTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      maxLength={1000}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAnswer(q.id)}
                      disabled={!answerTexts[q.id]?.trim() || answeringId === q.id}
                    >
                      {answeringId === q.id ? "…" : "Répondre"}
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    En attente de réponse
                  </p>
                )}
              </div>
            ))}
            {answerError && <p className="alert alert-error" style={{ margin: 0 }}>{answerError}</p>}
          </div>
        )}

        {nextCursor && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={loadingMore}
            onClick={() => load(nextCursor)}
            style={{ marginBottom: "var(--space-3)" }}
          >
            {loadingMore ? "Chargement…" : "Voir plus de questions"}
          </button>
        )}

        {/* Ask form — non-owner authenticated only */}
        {isAuthenticated && !isOwner && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <label className="label">Poser une question</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Votre question (5–500 caractères)"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              minLength={5}
              maxLength={500}
            />
            {askError && <p className="alert alert-error" style={{ margin: 0 }}>{askError}</p>}
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAsk}
                disabled={askText.trim().length < 5 || asking}
              >
                {asking ? "Envoi…" : "Envoyer la question"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Reviews Section ──────────────────────────────────────────────────────────

function ReviewsSection({ sellerUserId, listingId, isOwner, isAuthenticated }: {
  sellerUserId: string;
  listingId: string;
  isOwner: boolean;
  isAuthenticated: boolean;
}) {
  const [summary, setSummary] = useState<SellerReviewSummary | null>(null);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSellerReviewSummary(sellerUserId),
      getSellerReviews(sellerUserId, { limit: 5 }),
    ])
      .then(([s, r]) => {
        if (cancelled) return;
        setSummary(s);
        setReviews(r.items);
        setNextCursor(r.nextCursor);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sellerUserId]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getSellerReviews(sellerUserId, { cursor: nextCursor, limit: 5 });
      setReviews((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSubmitReview = async () => {
    if (reviewForm.rating === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createReview({
        sellerUserId,
        rating: reviewForm.rating,
        comment: reviewForm.comment || undefined,
        listingId,
      });
      setSubmitted(true);
      // Refresh summary
      const s = await getSellerReviewSummary(sellerUserId);
      setSummary(s);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  if (!summary) return null;

  const maxBreakdown = Math.max(...Object.values(summary.breakdown));

  return (
    <>
      <hr className="divider" />
      <div>
        <h2 style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", margin: "0 0 var(--space-3)" }}>
          Avis vendeur
        </h2>

        {/* Summary */}
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)", lineHeight: 1 }}>
              {summary.avgRating !== null ? summary.avgRating.toFixed(1) : "–"}
            </div>
            <StarRating value={summary.avgRating ?? 0} readOnly size="sm" />
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "4px" }}>
              {summary.totalCount} avis
            </div>
          </div>
          {summary.totalCount > 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = summary.breakdown[star];
                const pct = maxBreakdown > 0 ? (count / maxBreakdown) * 100 : 0;
                return (
                  <div key={star} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)" }}>
                    <span style={{ width: "12px", color: "var(--color-text-muted)" }}>{star}</span>
                    <div style={{ flex: 1, height: "6px", background: "var(--color-border)", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-warning, #f59e0b)", borderRadius: "3px" }} />
                    </div>
                    <span style={{ width: "20px", color: "var(--color-text-muted)", textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reviews list */}
        {reviews.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            {reviews.map((r) => (
              <div key={r.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}>
                  <StarRating value={r.rating} readOnly size="sm" />
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                    {r.reviewerUserId.slice(0, 8)}… · {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                {r.comment && (
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{r.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {nextCursor && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore} style={{ marginBottom: "var(--space-3)" }}>
            {loadingMore ? "Chargement…" : "Voir plus d'avis"}
          </button>
        )}

        {/* Review form — authenticated buyer, not owner, not yet submitted */}
        {isAuthenticated && !isOwner && !submitted && (
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)" }}>
            <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
              Laisser un avis
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <StarRating value={reviewForm.rating} readOnly={false} size="md" onChange={(r) => setReviewForm((f) => ({ ...f, rating: r }))} />
              <textarea
                className="input"
                rows={2}
                placeholder="Commentaire (optionnel, max 1000 caractères)"
                value={reviewForm.comment}
                onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
                maxLength={1000}
              />
              {submitError && <p className="alert alert-error" style={{ margin: 0 }}>{submitError}</p>}
              <div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSubmitReview}
                  disabled={reviewForm.rating === 0 || submitting}
                >
                  {submitting ? "Envoi…" : "Publier l'avis"}
                </button>
              </div>
            </div>
          </div>
        )}
        {submitted && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-success, #10b981)", margin: 0 }}>
            Avis publié, merci !
          </p>
        )}
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buySuccess, setBuySuccess] = useState<{ orderId: string } | null>(null);

  const fetchListing = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Annonce introuvable");
        throw new Error(`Erreur ${res.status}`);
      }
      const json = await res.json();
      const data = json.data;
      setListing(data);
      setIsFavorited(!!data.isFavorited);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchListing(); }, [fetchListing]);
  useEffect(() => { setGalleryIndex(0); }, [id]);

  const toggleFavorite = async () => {
    if (!id || favoriteLoading) return;
    setHeartPop(true);
    setFavoriteLoading(true);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}/favorite`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setIsFavorited(json.data.favorited);
      }
    } finally {
      setFavoriteLoading(false);
    }
    setTimeout(() => setHeartPop(false), 520);
  };

  const submitReport = async () => {
    if (!id || !reportReason.trim() || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const res = await fetchWithAuth(`/reports/listings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      if (res.ok) {
        setReportSent(true);
        setReportOpen(false);
        setReportReason("");
      }
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleBuy = async () => {
    if (!id || buyLoading) return;
    setBuyLoading(true);
    setBuyError(null);
    try {
      const result = await buyListing(id);
      setBuySuccess({ orderId: result.orderId });
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Erreur lors de l'achat");
    } finally {
      setBuyLoading(false);
    }
  };

  const hasAuth = !!getAccessToken();
  const isOwner = !!listing && !!user && listing.userId === user.userId;
  const canBuy = !!listing && listing.status === "PUBLISHED" && isAuthenticated && !isOwner;

  if (loading) {
    return (
      <section>
        <Link to="/produits" className="back-link">&larr; Marketplace</Link>
        <div className="listing-detail-layout">
          <div className="listing-detail-gallery">
            <Skeleton variant="image" height="400px" />
          </div>
          <div className="listing-detail-info">
            <Skeleton variant="heading" width="60%" />
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="100%" />
            <Skeleton variant="rect" height="48px" width="100%" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <Link to="/produits" className="back-link">&larr; Marketplace</Link>
        <ErrorState message={error} onRetry={fetchListing} />
      </section>
    );
  }

  if (!listing) return null;

  const hasImages = listing.images && listing.images.length > 0;
  const images = listing.images ?? [];
  const currentImage = images[galleryIndex];
  const canPrev = images.length > 1 && galleryIndex > 0;
  const canNext = images.length > 1 && galleryIndex < images.length - 1;

  return (
    <section>
      <Link to="/produits" className="back-link">&larr; Marketplace</Link>

      <div className="listing-detail-layout">
        {/* Gallery / carousel */}
        <div className="listing-detail-gallery">
          {hasImages ? (
            <>
              <div className="listing-detail-main-image">
                <img
                  src={currentImage!.storageKey}
                  alt={`${listing.title} — image ${galleryIndex + 1}`}
                />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="listing-detail-carousel-btn listing-detail-carousel-btn--prev"
                      onClick={() => setGalleryIndex((i) => Math.max(0, i - 1))}
                      disabled={!canPrev}
                      aria-label="Image précédente"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="listing-detail-carousel-btn listing-detail-carousel-btn--next"
                      onClick={() => setGalleryIndex((i) => Math.min(images.length - 1, i + 1))}
                      disabled={!canNext}
                      aria-label="Image suivante"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="listing-detail-dots" role="tablist" aria-label="Images">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={i === galleryIndex}
                      aria-label={`Image ${i + 1}`}
                      className={`listing-detail-dot ${i === galleryIndex ? "active" : ""}`}
                      onClick={() => setGalleryIndex(i)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="img-placeholder" style={{ aspectRatio: "4/3", fontSize: "var(--text-3xl)" }}>
              {GAME_LABELS[listing.game]?.[0] ?? "?"}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="listing-detail-info">
          <div className="listing-detail-badges">
            <Badge variant="primary">{STATUS_LABELS[listing.status]}</Badge>
            <Badge>{GAME_LABELS[listing.game]}</Badge>
            <Badge>{CATEGORY_LABELS[listing.category]}</Badge>
          </div>

          <h1 className="listing-detail-title">{listing.title}</h1>

          {listing.cardName && listing.cardName !== listing.title && (
            <p style={{ margin: "0 0 var(--space-2)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              {listing.cardName}
              {listing.setCode && <> &middot; {listing.setCode}</>}
              {listing.edition && <> &middot; {listing.edition}</>}
            </p>
          )}

          {/* Attributes row */}
          <div className="listing-detail-attrs">
            <div className="listing-detail-attr">
              <span className="listing-detail-attr-label">Etat</span>
              <span className="listing-detail-attr-value">{CONDITION_LABELS[listing.condition]}</span>
            </div>
            <div className="listing-detail-attr">
              <span className="listing-detail-attr-label">Langue</span>
              <span className="listing-detail-attr-value">{LANGUAGE_LABELS[listing.language]}</span>
            </div>
            <div className="listing-detail-attr">
              <span className="listing-detail-attr-label">Quantite</span>
              <span className="listing-detail-attr-value">{listing.quantity}</span>
            </div>
          </div>

          <hr className="divider" />

          {/* Price block */}
          <div className="listing-detail-price-block">
            <div>
              <span className="listing-detail-price-label">Prix demandé</span>
              <PriceDisplay cents={listing.priceCents} currency={listing.currency} size="lg" deltaCents={listing.deltaCents} />
            </div>
            <PriceDeltaBadge
              priceCents={listing.priceCents}
              marketPriceCents={listing.marketPriceCents}
              deltaCents={listing.deltaCents}
              currency={listing.currency}
              size="md"
            />
          </div>

          {/* Buy CTA — desktop */}
          {canBuy && (
            <div style={{ marginTop: "var(--space-3)" }}>
              {buySuccess ? (
                <div className="alert" style={{ background: "var(--color-success-subtle, rgba(16,185,129,0.1))", border: "1px solid var(--color-success, #10b981)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", fontSize: "var(--text-sm)" }}>
                  Commande créée !{" "}
                  <Link to="/achats" style={{ color: "var(--color-primary)", fontWeight: "var(--font-semibold)" }}>
                    Voir mes achats
                  </Link>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={handleBuy}
                    disabled={buyLoading}
                  >
                    {buyLoading ? "En cours…" : `Acheter · ${(listing.priceCents / 100).toFixed(2)} €`}
                  </button>
                  {buyError && (
                    <p className="alert alert-error" style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)" }}>
                      {buyError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Description */}
          {listing.description && (
            <>
              <hr className="divider" />
              <div>
                <h2 style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", margin: "0 0 var(--space-2)" }}>
                  Description
                </h2>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>
                  {listing.description}
                </p>
              </div>
            </>
          )}

          {/* Shipping */}
          <ShippingSection
            listingId={listing.id}
            isOwner={isOwner}
            listingStatus={listing.status}
          />

          <hr className="divider" />

          {/* Seller info */}
          <div className="listing-detail-seller">
            Vendeur : {listing.userId.slice(0, 8)}…
            {listing.publishedAt && (
              <> · Publiée le {new Date(listing.publishedAt).toLocaleDateString("fr-FR")}</>
            )}
          </div>

          {/* Report listing */}
          {hasAuth && listing.status === "PUBLISHED" && (
            <div className="listing-detail-report">
              {reportSent ? (
                <p className="listing-detail-report-sent">Signalement envoyé.</p>
              ) : reportOpen ? (
                <div className="listing-detail-report-form">
                  <label htmlFor="report-reason" className="sr-only">Raison du signalement</label>
                  <textarea
                    id="report-reason"
                    className="input"
                    rows={2}
                    placeholder="Raison du signalement (obligatoire)"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    maxLength={200}
                  />
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={submitReport}
                      disabled={!reportReason.trim() || reportSubmitting}
                    >
                      {reportSubmitting ? "Envoi…" : "Envoyer"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setReportOpen(false); setReportReason(""); }}
                      disabled={reportSubmitting}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReportOpen(true)}
                >
                  Signaler cette annonce
                </button>
              )}
            </div>
          )}

          {/* Q&A */}
          <QASection
            listingId={listing.id}
            isOwner={isOwner}
            isAuthenticated={isAuthenticated}
          />

          {/* Seller Reviews */}
          <ReviewsSection
            sellerUserId={listing.userId}
            listingId={listing.id}
            isOwner={isOwner}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </div>

      {/* Sticky mobile CTA */}
      {listing.status === "PUBLISHED" && (
        <div className="sticky-bottom md:hidden">
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {canBuy ? (
              buySuccess ? (
                <Link to="/achats" className="btn btn-primary btn-lg" style={{ flex: 1 }}>
                  Voir mes achats
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1 }}
                  onClick={handleBuy}
                  disabled={buyLoading}
                >
                  {buyLoading ? "En cours…" : `Acheter · ${(listing.priceCents / 100).toFixed(2)} €`}
                </button>
              )
            ) : (
              <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled>
                {(listing.priceCents / 100).toFixed(2)} €
              </button>
            )}
            {hasAuth && (
              <button
                type="button"
                className={`btn btn-secondary btn-lg ${isFavorited ? "favorited" : ""} ${heartPop ? "btn--heart-pop" : ""}`}
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                {isFavorited ? "\u2764\uFE0F" : "\u2661"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
