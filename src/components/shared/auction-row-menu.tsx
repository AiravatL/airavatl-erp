"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Repeat, ExternalLink } from "lucide-react";

interface AuctionRowMenuProps {
  auctionId: string;
}

export function AuctionRowMenu({ auctionId }: AuctionRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="h-4 w-4 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem asChild>
          <Link href={`/delivery-requests/new?repeat=${auctionId}`} className="flex items-center gap-2">
            <Repeat className="h-3.5 w-3.5" />
            Repeat Auction
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/delivery-requests/${auctionId}`} className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            View Details
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
