-- Audit trail for shift clock-in/out and claim/approve/reject actions
CREATE TABLE "shift_audit_logs" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shift_audit_logs_shiftId_idx" ON "shift_audit_logs"("shiftId");

CREATE INDEX "shift_audit_logs_actorUserId_idx" ON "shift_audit_logs"("actorUserId");

ALTER TABLE "shift_audit_logs" ADD CONSTRAINT "shift_audit_logs_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_audit_logs" ADD CONSTRAINT "shift_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
