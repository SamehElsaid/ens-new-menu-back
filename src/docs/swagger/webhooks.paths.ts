/**
 * @openapi
 * /api/webhooks/resend:
 *   post:
 *     tags: [Webhooks]
 *     summary: Resend inbound email webhook
 *     description: |
 *       Receives Resend email.received events (Svix-signed). When the message
 *       is addressed to info@ensmenu.com, fetches full content via the Receiving
 *       API and forwards a copy to INBOUND_FORWARD_TO (default ensegypt20@gmail.com)
 *       with Reply-To set to the original sender.
 *       Auth is Svix signature headers (svix-id, svix-timestamp, svix-signature),
 *       not JWT or x-api-key. Requires RESEND_WEBHOOK_SECRET.
 *     security: []
 *     parameters:
 *       - in: header
 *         name: svix-id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: svix-timestamp
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: svix-signature
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             type: email.received
 *             created_at: "2026-02-22T23:41:12.126Z"
 *             data:
 *               email_id: "56761188-7520-42d8-8898-ff6fc54ce618"
 *               created_at: "2026-02-22T23:41:11.894Z"
 *               from: "customer@example.com"
 *               to: ["info@ensmenu.com"]
 *               subject: "Support question"
 *               message_id: "<111-222-333@email.example.com>"
 *               attachments: []
 *     responses:
 *       200:
 *         description: Event accepted (forwarded, skipped duplicate, or ignored non-received type)
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               skipped: false
 *       400:
 *         description: Invalid signature or missing Svix headers
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Invalid signature
 *       500:
 *         description: Forward failed or webhook/email not configured
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Forward failed
 */

export {};
