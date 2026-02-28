"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import {
  addRateComment,
  deleteRateComment,
  decideRate,
  listRateComments,
  listRatesForReview,
  updateRateComment,
} from "@/lib/api/rates";
import { queryKeys } from "@/lib/query/keys";
import { RATE_CATEGORY_LABELS } from "@/lib/types";
import type { MarketRate, RateComment, RateStatus, Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  MailWarning,
  MapPin,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  Truck,
  User as UserIcon,
  XCircle,
} from "lucide-react";

const REVIEWER_STATUS_TABS: { label: string; value: RateStatus | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];
const SALES_STATUS_TABS: { label: string; value: RateStatus | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

const RATE_STATUS_LABELS: Record<RateStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const RATE_STATUS_COLORS: Record<RateStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

const REVIEW_ACCESS_ROLES = ["super_admin", "admin", "operations_vehicles", "sales_vehicles"] as const;
const REVIEW_DECISION_ROLES = ["super_admin", "admin", "operations_vehicles"] as const;
const EDIT_ROLES: Role[] = ["sales_vehicles", "operations_vehicles", "admin", "super_admin"];
const COLLAPSED_COMMENT_COUNT = 2;
const RATE_COMMENT_MAX_LENGTH = 500;

function canUserEditRate(user: { id: string; role: Role } | null, rate: MarketRate): boolean {
  if (!user || !EDIT_ROLES.includes(user.role)) return false;
  if (user.role === "sales_vehicles") return rate.submittedBy === user.id;
  return true;
}

function canUserEditComment(user: User | null, comment: RateComment): boolean {
  if (!user) return false;
  return comment.createdById === user.id;
}

function canUserDeleteComment(user: User | null, comment: RateComment): boolean {
  if (!user) return false;
  if (comment.createdById === user.id) return true;
  return user.role === "admin" || user.role === "super_admin";
}

function validateRateCommentInput(value: string): { normalized: string; error: string | null } {
  const normalized = value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { normalized, error: "Comment cannot be empty." };
  }
  if (normalized.length > RATE_COMMENT_MAX_LENGTH) {
    return { normalized, error: `Comment cannot exceed ${RATE_COMMENT_MAX_LENGTH} characters.` };
  }
  return { normalized, error: null };
}

export default function RateReviewPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<RateStatus | "all">("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [pendingRateIds, setPendingRateIds] = useState<string[]>([]);

  const hasRestrictedUser = user ? !(REVIEW_ACCESS_ROLES as readonly string[]).includes(user.role) : false;
  const canDecideRates = user ? (REVIEW_DECISION_ROLES as readonly string[]).includes(user.role) : false;
  const visibleTabs = canDecideRates ? REVIEWER_STATUS_TABS : SALES_STATUS_TABS;
  const reviewQueryKey = queryKeys.reviewRates({ status: activeTab });

  const reviewRatesQuery = useQuery({
    queryKey: reviewQueryKey,
    queryFn: () =>
      listRatesForReview({
        status: activeTab === "all" ? undefined : activeTab,
        limit: 200,
        offset: 0,
      }),
    enabled: !hasRestrictedUser,
  });

  function setPending(rateId: string, pending: boolean) {
    setPendingRateIds((prev) => {
      if (pending) return prev.includes(rateId) ? prev : [...prev, rateId];
      return prev.filter((id) => id !== rateId);
    });
  }

  const decisionMutation = useMutation({
    mutationFn: async ({
      rate,
      action,
      reviewRemarks,
    }: {
      rate: MarketRate;
      action: "approve" | "reject";
      reviewRemarks?: string;
    }) => decideRate(rate.id, { action, reviewRemarks }),
    onMutate: async ({ rate, action }) => {
      setActionError(null);
      setActionInfo(null);
      setPending(rate.id, true);

      await queryClient.cancelQueries({ queryKey: ["rates", "review"] });
      const previousRates = queryClient.getQueryData<MarketRate[]>(reviewQueryKey) ?? [];
      queryClient.setQueryData<MarketRate[]>(reviewQueryKey, (current = []) => {
        if (activeTab === "pending") {
          return current.filter((item) => item.id !== rate.id);
        }
        return current.map((item) =>
          item.id === rate.id
            ? {
                ...item,
                status: action === "approve" ? "approved" : "rejected",
                reviewedBy: user?.id ?? item.reviewedBy,
                reviewedByName: user?.fullName ?? item.reviewedByName,
                reviewedAt: new Date().toISOString(),
              }
            : item,
        );
      });
      return { previousRates, rateId: rate.id };
    },
    onSuccess: (updated, variables) => {
      setActionInfo(`Rate ${variables.action === "approve" ? "approved" : "rejected"} successfully.`);
      queryClient.setQueryData<MarketRate[]>(reviewQueryKey, (current = []) => {
        if (activeTab === "pending") return current;
        return current.map((item) => (item.id === updated.id ? updated : item));
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousRates) {
        queryClient.setQueryData(reviewQueryKey, context.previousRates);
      }
      setActionError(error instanceof Error ? error.message : "Unable to review rate");
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.rateId) {
        setPending(context.rateId, false);
      }
      void queryClient.invalidateQueries({ queryKey: ["rates", "review"] });
      void queryClient.invalidateQueries({ queryKey: ["rates", "approved"] });
    },
  });

  async function handleDecision(rate: MarketRate, action: "approve" | "reject") {
    if (!canDecideRates) return;
    let reviewRemarks = "";
    if (action === "reject") {
      const promptValue = window.prompt("Enter rejection reason:", "");
      if (promptValue === null) return;
      reviewRemarks = promptValue.trim();
      if (!reviewRemarks) {
        setActionError("Rejection reason is required.");
        return;
      }
    }

    await decisionMutation.mutateAsync({
      rate,
      action,
      reviewRemarks: reviewRemarks || undefined,
    });
  }

  if (hasRestrictedUser) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access restricted"
        description="Rate review is available to Vehicle Sales, Vehicle Operations and Admin roles."
      />
    );
  }

  const rates = reviewRatesQuery.data ?? [];
  const reviewError = reviewRatesQuery.error instanceof Error ? reviewRatesQuery.error.message : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rate Review"
        description={canDecideRates ? "Review submitted market rates" : "Track submitted market rates"}
      />

      <div className="flex gap-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.value ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reviewError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{reviewError}</p>
          </CardContent>
        </Card>
      )}

      {actionError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{actionError}</p>
          </CardContent>
        </Card>
      )}

      {actionInfo && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-emerald-700">{actionInfo}</p>
          </CardContent>
        </Card>
      )}

      {reviewRatesQuery.isLoading ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading rates...</p>
          </CardContent>
        </Card>
      ) : rates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No rates to show"
          description="No rates match the selected filter."
        />
      ) : (
        <div className="space-y-3">
          {rates.map((rate) => (
            <RateReviewCard
              key={rate.id}
              user={user}
              rate={rate}
              pending={pendingRateIds.includes(rate.id)}
              canDecide={canDecideRates}
              editHref={canUserEditRate(user, rate) ? `/rates/${rate.id}/edit` : null}
              onApprove={() => handleDecision(rate, "approve")}
              onReject={() => handleDecision(rate, "reject")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RateReviewCard({
  user,
  rate,
  pending,
  canDecide,
  editHref,
  onApprove,
  onReject,
}: {
  user: User | null;
  rate: MarketRate;
  pending: boolean;
  canDecide: boolean;
  editHref: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isPending = rate.status === "pending";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-900">{rate.fromLocation}</span>
            <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-900">{rate.toLocation}</span>
          </div>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
              RATE_STATUS_COLORS[rate.status],
            )}
          >
            {rate.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
            {rate.status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {rate.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
            {RATE_STATUS_LABELS[rate.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Vehicle Type</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Truck className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-gray-900">{rate.vehicleType}</span>
            </div>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Category</p>
            <p className="text-gray-900 mt-0.5">{RATE_CATEGORY_LABELS[rate.rateCategory]}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Freight Rate</p>
            <p className="text-gray-900 font-semibold mt-0.5">{formatCurrency(rate.freightRate)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Per Ton</p>
            <p className="text-gray-900 mt-0.5">{rate.ratePerTon ? formatCurrency(rate.ratePerTon) : "—"}</p>
          </div>
        </div>

        {rate.ratePerKg && (
          <div className="text-sm">
            <span className="text-gray-500">Per KG: </span>
            <span className="text-gray-900">{formatCurrency(rate.ratePerKg)}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {rate.confidenceLevel && (
            <span className="flex items-center gap-1">
              Confidence:
              <span
                className={cn(
                  "font-medium",
                  rate.confidenceLevel === "high"
                    ? "text-emerald-600"
                    : rate.confidenceLevel === "medium"
                      ? "text-amber-600"
                      : "text-red-500",
                )}
              >
                {rate.confidenceLevel.charAt(0).toUpperCase() + rate.confidenceLevel.slice(1)}
              </span>
            </span>
          )}
          {rate.source && (
            <span className="flex items-center gap-1">
              Source: <span className="text-gray-700">{rate.source}</span>
            </span>
          )}
        </div>

        {rate.remarks && (
          <div className="flex gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-gray-600">{rate.remarks}</p>
          </div>
        )}

        <RateCommentsSection rateId={rate.id} currentUser={user} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <UserIcon className="h-3.5 w-3.5" />
            <span>
              Submitted by <span className="text-gray-700 font-medium">{rate.submittedByName}</span>
            </span>
            <span>·</span>
            <span>{formatDate(rate.createdAt)}</span>
            {rate.reviewedByName && (
              <>
                <span>·</span>
                <span>
                  Reviewed by <span className="text-gray-700 font-medium">{rate.reviewedByName}</span>
                </span>
              </>
            )}
          </div>

          {isPending && canDecide && (
            <div className="flex gap-2">
              {editHref && (
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <Link href={editHref}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Link>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                disabled={pending}
                onClick={onReject}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
              <Button size="sm" className="h-7 text-xs" disabled={pending} onClick={onApprove}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
            </div>
          )}

          {isPending && !canDecide && editHref && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                <Link href={editHref}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Link>
              </Button>
            </div>
          )}

          {!isPending && (
            <div className="flex items-center gap-2">
              {editHref && (
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <Link href={editHref}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Link>
                </Button>
              )}
              {rate.status === "rejected" && (
                <div className="inline-flex items-center gap-1 text-xs text-red-600">
                  <MailWarning className="h-3.5 w-3.5" />
                  Rejected
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RateCommentsSection({
  rateId,
  currentUser,
}: {
  rateId: string;
  currentUser: User | null;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryKey: queryKeys.rateComments(rateId),
    queryFn: () => listRateComments(rateId),
  });

  const addCommentMutation = useMutation({
    mutationFn: async (commentText: string) => addRateComment(rateId, { commentText }),
    onMutate: async (commentText) => {
      setLocalError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.rateComments(rateId) });
      const previousComments = queryClient.getQueryData<RateComment[]>(queryKeys.rateComments(rateId)) ?? [];
      const tempId = `temp-${Date.now()}`;
      const optimisticComment: RateComment = {
        id: tempId,
        rateId,
        commentText,
        createdById: currentUser?.id ?? "unknown",
        createdByName: currentUser?.fullName ?? "You",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<RateComment[]>(queryKeys.rateComments(rateId), [
        optimisticComment,
        ...previousComments,
      ]);
      setNewComment("");
      return { previousComments, tempId, typed: commentText };
    },
    onSuccess: (created, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData<RateComment[]>(queryKeys.rateComments(rateId), (current = []) =>
        current.map((comment) => (comment.id === context.tempId ? created : comment)),
      );
    },
    onError: (error, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData(queryKeys.rateComments(rateId), context.previousComments);
      setNewComment(context.typed);
      setLocalError(error instanceof Error ? error.message : "Unable to add comment");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rateComments(rateId) });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId, commentText }: { commentId: string; commentText: string }) =>
      updateRateComment(rateId, commentId, { commentText }),
    onMutate: async ({ commentId, commentText }) => {
      setLocalError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.rateComments(rateId) });
      const previousComments = queryClient.getQueryData<RateComment[]>(queryKeys.rateComments(rateId)) ?? [];
      queryClient.setQueryData<RateComment[]>(queryKeys.rateComments(rateId), (current = []) =>
        current.map((comment) =>
          comment.id === commentId
            ? { ...comment, commentText, updatedAt: new Date().toISOString() }
            : comment,
        ),
      );
      return { previousComments };
    },
    onSuccess: (updatedComment) => {
      queryClient.setQueryData<RateComment[]>(queryKeys.rateComments(rateId), (current = []) =>
        current.map((comment) => (comment.id === updatedComment.id ? updatedComment : comment)),
      );
      setEditingCommentId(null);
      setEditText("");
    },
    onError: (error, _vars, context) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.rateComments(rateId), context.previousComments);
      }
      setLocalError(error instanceof Error ? error.message : "Unable to edit comment");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rateComments(rateId) });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => deleteRateComment(rateId, commentId),
    onMutate: async (commentId) => {
      setLocalError(null);
      setDeletingCommentId(commentId);
      await queryClient.cancelQueries({ queryKey: queryKeys.rateComments(rateId) });
      const previousComments = queryClient.getQueryData<RateComment[]>(queryKeys.rateComments(rateId)) ?? [];
      queryClient.setQueryData<RateComment[]>(queryKeys.rateComments(rateId), (current = []) =>
        current.filter((comment) => comment.id !== commentId),
      );
      return { previousComments, commentId };
    },
    onSuccess: (_deleted, commentId) => {
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditText("");
      }
    },
    onError: (error, _commentId, context) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.rateComments(rateId), context.previousComments);
      }
      setLocalError(error instanceof Error ? error.message : "Unable to delete comment");
    },
    onSettled: () => {
      setDeletingCommentId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.rateComments(rateId) });
    },
  });

  async function handleAddComment() {
    if (addCommentMutation.isPending) return;
    const validation = validateRateCommentInput(newComment);
    if (validation.error) {
      setLocalError(validation.error);
      return;
    }
    await addCommentMutation.mutateAsync(validation.normalized);
  }

  async function handleSaveEdit(commentId: string) {
    if (editCommentMutation.isPending) return;
    const validation = validateRateCommentInput(editText);
    if (validation.error) {
      setLocalError(validation.error);
      return;
    }
    await editCommentMutation.mutateAsync({ commentId, commentText: validation.normalized });
  }

  async function handleDeleteComment(commentId: string) {
    if (deleteCommentMutation.isPending) return;
    await deleteCommentMutation.mutateAsync(commentId);
  }

  const comments = commentsQuery.data ?? [];
  const shownComments = expanded ? comments : comments.slice(0, COLLAPSED_COMMENT_COUNT);
  const loadError = commentsQuery.error instanceof Error ? commentsQuery.error.message : null;
  const visibleError = localError ?? loadError;

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/70 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">Comments</p>
        {comments.length > COLLAPSED_COMMENT_COUNT && (
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Show less" : `Show all (${comments.length})`}
          </button>
        )}
      </div>

      {visibleError && <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600">{visibleError}</p>}

      {commentsQuery.isLoading ? (
        <p className="text-xs text-gray-500">Loading comments...</p>
      ) : shownComments.length === 0 ? (
        <p className="text-xs text-gray-500">No comments yet.</p>
      ) : (
        <div className="space-y-2">
          {shownComments.map((comment) => {
            const isEditing = editingCommentId === comment.id;
            const canEdit = canUserEditComment(currentUser, comment);
            const canDelete = canUserDeleteComment(currentUser, comment);
            const isDeleting = deletingCommentId === comment.id;
            const isEdited =
              comment.updatedAt && new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime();

            return (
              <div key={comment.id} className="rounded-md border border-gray-200 bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-700">{comment.createdByName}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-[11px] text-gray-500">{formatDateTime(comment.createdAt)}</p>
                    {canEdit && !isEditing && !isDeleting && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-gray-600 hover:text-gray-800"
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditText(comment.commentText);
                        }}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                    {canDelete && !isEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-red-600 hover:text-red-700"
                        disabled={isDeleting}
                        onClick={() => {
                          void handleDeleteComment(comment.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {isDeleting ? "Deleting..." : "Delete"}
                      </Button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(event) => {
                        if (localError) setLocalError(null);
                        setEditText(event.target.value);
                      }}
                      rows={2}
                      maxLength={RATE_COMMENT_MAX_LENGTH}
                      className="text-xs resize-none"
                    />
                    <p className="text-[11px] text-gray-500 text-right">
                      {editText.length}/{RATE_COMMENT_MAX_LENGTH}
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditText("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={
                          !editText.trim() ||
                          editText.trim().length > RATE_COMMENT_MAX_LENGTH ||
                          editCommentMutation.isPending
                        }
                        onClick={() => {
                          void handleSaveEdit(comment.id);
                        }}
                      >
                        {editCommentMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                    {comment.commentText}
                    {isEdited && <span className="ml-1 text-xs text-gray-400">(edited)</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          placeholder="Add a comment..."
          rows={2}
          value={newComment}
          onChange={(event) => {
            if (localError) setLocalError(null);
            setNewComment(event.target.value);
          }}
          maxLength={RATE_COMMENT_MAX_LENGTH}
          className="text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            {newComment.length}/{RATE_COMMENT_MAX_LENGTH}
          </p>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={
              !newComment.trim() ||
              newComment.trim().length > RATE_COMMENT_MAX_LENGTH ||
              addCommentMutation.isPending
            }
            onClick={() => {
              void handleAddComment();
            }}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {addCommentMutation.isPending ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
