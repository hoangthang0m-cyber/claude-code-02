"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCampaignComments } from "@/modules/campaigns/hooks/useCampaignComments"

export function CampaignComments({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const { comments, postComment } = useCampaignComments(campaignId)
  const [content, setContent] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !content.trim()) return
    setIsSubmitting(true)
    try {
      await postComment(user.uid, content)
      setContent("")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Bình luận</p>

      <div className="flex flex-col gap-2">
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground">Chưa có bình luận nào.</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-md border px-2.5 py-1.5 text-sm">
            <p className="text-xs font-medium text-muted-foreground">{comment.authorId}</p>
            <p>{comment.content}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder="Viết bình luận..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={isSubmitting || !content.trim()}>
          Gửi
        </Button>
      </form>
    </div>
  )
}
