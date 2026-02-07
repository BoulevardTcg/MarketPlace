-- Compound index for handover list by user + status
CREATE INDEX "Handover_requestedByUserId_status_idx" ON "Handover"("requestedByUserId", "status");
