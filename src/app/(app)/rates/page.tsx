"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addRateComment,
  deleteRateComment,
  listApprovedRates,
  listRateComments,
  updateRateComment,
} from "@/lib/api/rates";
import { useAuth } from "@/lib/auth/auth-context";
import { queryKeys } from "@/lib/query/keys";
import { RATE_CATEGORY_LABELS } from "@/lib/types";
import type { MarketRate, RateCategory, RateComment, Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import {
  ArrowRight,
  BookOpen,
  MapPin,
  Pencil,
  Search,
  Send,
  Trash2,
  Truck,
} from "lucide-react";

const VEHICLE_TYPES = ["All", "32ft MXL", "20ft SXL", "40ft Trailer"];
const EDIT_ROLES: Role[] = ["sales_vehicles", "operations_vehicles", "admin", "super_admin"];
const REQUEST_RATE_ROLES: Role[] = ["sales_consigner", "operations_consigner", "admin", "super_admin"];
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

export default function AllRatesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const approvedRatesQuery = useQuery({
    queryKey: queryKeys.approvedRates({ search: "", vehicleType: "All", category: "all" }),
    queryFn: () => listApprovedRates({ limit: 500, offset: 0 }),
  });

  const rates = useMemo(() => approvedRatesQuery.data ?? [], [approvedRatesQuery.data]);
  const filtered = useMemo(
    () =>
      rates.filter((rate) => {
        const matchesSearch =
          !search ||
          rate.fromLocation.toLowerCase().includes(search.toLowerCase()) ||
          rate.toLocation.toLowerCase().includes(search.toLowerCase());
        const matchesVehicle = vehicleFilter === "All" || rate.vehicleType === vehicleFilter;
        const matchesCategory = categoryFilter === "all" || rate.rateCategory === categoryFilter;
        return matchesSearch && matchesVehicle && matchesCategory;
      }),
    [rates, search, vehicleFilter, categoryFilter],
  );

  const ratesLoadError =
    approvedRatesQuery.error instanceof Error ? approvedRatesQuery.error.message : null;
  const canRequestRate = Boolean(user && REQUEST_RATE_ROLES.includes(user.role));

  return (
    <div className="space-y-4">
      <PageHeader title="All Rates" description={`${rates.length} approved rates in the library`}>
        {canRequestRate && (
          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/rates/request">
              <Send className="mr-1 h-3.5 w-3.5" />
              Request Rate
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
            maxLength={FIELD_LIMITS.search}
          />
        </div>
        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VEHICLE_TYPES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.entries(RATE_CATEGORY_LABELS) as [RateCategory, string][]).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ratesLoadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {ratesLoadError}
        </div>
      )}

      {approvedRatesQuery.isLoading ? (
        <div className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500">Loading rates...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No rates found"
          description="No approved rates match your search criteria."
        />
      ) : (
        <>
          <div className="hidden md:block border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Route</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Vehicle</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Category</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Freight Rate</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Per Ton</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Confidence</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Approved By</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Source</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rate) => {
                  const canEditRate = canUserEditRate(user, rate);
                  return (
                    <Fragment key={rate.id}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-900">{rate.fromLocation}</span>
                            <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="text-gray-900">{rate.toLocation}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{rate.vehicleType}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={rate.rateCategory}
                            label={RATE_CATEGORY_LABELS[rate.rateCategory]}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(rate.freightRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {rate.ratePerTon ? formatCurrency(rate.ratePerTon) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ConfidenceDot level={rate.confidenceLevel} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {rate.reviewedByName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                          {rate.source || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canEditRate ? (
                            <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                              <Link href={`/rates/${rate.id}/edit`}>
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-200 bg-gray-50/30">
                        <td colSpan={9} className="px-4 py-3">
                          <RateCommentsSection rateId={rate.id} currentUser={user} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((rate) => {
              const canEditRate = canUserEditRate(user, rate);
              return (
                <div key={rate.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-medium text-gray-900">{rate.fromLocation}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className="font-medium text-gray-900">{rate.toLocation}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm text-gray-600">{rate.vehicleType}</span>
                    </div>
                    <StatusBadge
                      status={rate.rateCategory}
                      label={RATE_CATEGORY_LABELS[rate.rateCategory]}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(rate.freightRate)}</p>
                      {rate.ratePerTon && (
                        <p className="text-xs text-gray-500">{formatCurrency(rate.ratePerTon)}/ton</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Approved by:{" "}
                        <span className="text-gray-700">{rate.reviewedByName ?? "—"}</span>
                      </p>
                    </div>
                    <ConfidenceDot level={rate.confidenceLevel} showLabel />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {rate.source ? (
                      <p className="text-xs text-gray-500 truncate">{rate.source}</p>
                    ) : (
                      <span className="text-xs text-gray-400">No source</span>
                    )}
                    <div className="flex gap-1.5">
                      {canEditRate && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <Link href={`/rates/${rate.id}/edit`}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                  <RateCommentsSection rateId={rate.id} currentUser={user} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
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

function ConfidenceDot({
  level,
  showLabel,
}: {
  level: "low" | "medium" | "high" | null;
  showLabel?: boolean;
}) {
  const config: Record<string, { color: string; label: string }> = {
    high: { color: "bg-emerald-500", label: "High" },
    medium: { color: "bg-amber-500", label: "Medium" },
    low: { color: "bg-red-400", label: "Low" },
  };

  const c = level ? config[level] : null;
  if (!c) return <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2 w-2 rounded-full", c.color)} />
      {showLabel && <span className="text-xs text-gray-600">{c.label}</span>}
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
