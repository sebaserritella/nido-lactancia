import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { es } from "../i18n/es";
import { trackAttempt, trackRejected } from "../lib/analytics";
import { normalizeEmail } from "../lib/email";
import { messageForError } from "../lib/errors";

type FamilyPanelProps = {
  client: SupabaseClient;
  onLeftHousehold: () => void;
  onClose: () => void;
};

type PeoplePayload = {
  members: { user_id: string; email: string; is_owner: boolean; is_self: boolean }[];
  pending: { email: string; created_at: string }[];
};

export function FamilyPanel({ client, onLeftHousehold, onClose }: FamilyPanelProps) {
  const [people, setPeople] = useState<PeoplePayload | null>(null);
  const [relativeEmail, setRelativeEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPeople() {
    const { data, error: loadError } = await client.rpc("list_household_people");
    if (loadError) {
      setError(messageForError(loadError));
      return;
    }
    setPeople(data as PeoplePayload);
    setError(null);
  }

  useEffect(() => {
    void loadPeople();
  }, [client]);

  const isOwner = people?.members.some((member) => member.is_self && member.is_owner) ?? false;

  async function inviteRelative(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInviteSent(false);
    let email: string;
    try {
      email = normalizeEmail(relativeEmail);
    } catch {
      setError(es.invalidEmail);
      trackRejected("caregiver_invited");
      return;
    }
    setInvitePending(true);
    const { error: sendError } = await client.rpc("invite_by_email", { p_email: email });
    setInvitePending(false);
    if (sendError) {
      setError(messageForError(sendError));
      trackAttempt("caregiver_invited", false, sendError);
      return;
    }
    setRelativeEmail("");
    setInviteSent(true);
    trackAttempt("caregiver_invited", true);
    await loadPeople();
  }

  async function removeMember(userId: string) {
    if (!confirm(es.familyRemoveConfirm)) return;
    setBusy(true);
    const { error: removeError } = await client.rpc("remove_household_member", { p_user_id: userId });
    setBusy(false);
    if (removeError) {
      setError(messageForError(removeError));
      return;
    }
    await loadPeople();
  }

  async function makeOwner(userId: string) {
    if (!confirm(es.familyMakeOwnerConfirm)) return;
    setBusy(true);
    const { error: transferError } = await client.rpc("transfer_household_ownership", { p_user_id: userId });
    setBusy(false);
    if (transferError) {
      setError(messageForError(transferError));
      return;
    }
    await loadPeople();
  }

  async function cancelInvite(email: string) {
    if (!confirm(es.familyCancelInviteConfirm)) return;
    setBusy(true);
    const { error: cancelError } = await client.rpc("cancel_email_invite", { p_email: email });
    setBusy(false);
    if (cancelError) {
      setError(messageForError(cancelError));
      return;
    }
    await loadPeople();
  }

  async function leaveHousehold() {
    if (!confirm(es.familyLeaveConfirm)) return;
    setBusy(true);
    const { error: leaveError } = await client.rpc("leave_household");
    setBusy(false);
    if (leaveError) {
      setError(messageForError(leaveError));
      return;
    }
    onLeftHousehold();
  }

  return (
    <section className="card stack">
      <div className="row-actions">
        <h2>{es.familyPeople}</h2>
        <button type="button" className="ghost" onClick={onClose}>
          {es.done}
        </button>
      </div>
      {people ? (
        <ul className="entries plain">
          {people.members.map((member) => (
            <li key={member.user_id}>
              <div className="row-actions">
                <div>
                  <div>{member.email}</div>
                  <p className="muted">
                    {member.is_owner ? es.familyOwner : es.familyMember}
                    {member.is_self ? ` · ${es.familyYou}` : ""}
                  </p>
                </div>
                {isOwner && !member.is_self && !member.is_owner ? (
                  <div className="row-actions">
                    <button type="button" className="ghost" disabled={busy} onClick={() => void makeOwner(member.user_id)}>
                      {es.familyMakeOwner}
                    </button>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void removeMember(member.user_id)}>
                      {es.familyRemove}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
          {people.pending.map((invite) => (
            <li key={invite.email}>
              <div className="row-actions">
                <div>
                  <div>{invite.email}</div>
                  <p className="muted">{es.familyPending}</p>
                </div>
                {isOwner ? (
                  <button type="button" className="ghost" disabled={busy} onClick={() => void cancelInvite(invite.email)}>
                    {es.familyCancelInvite}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {people && isOwner ? (
        <form className="stack" onSubmit={(event) => void inviteRelative(event)}>
          <h2>{es.inviteTitle}</h2>
          <label>
            {es.relativeEmail}
            <input
              type="email"
              required
              autoComplete="email"
              value={relativeEmail}
              onChange={(event) => {
                setRelativeEmail(event.target.value);
                setInviteSent(false);
              }}
            />
          </label>
          <p className="muted">{es.inviteHelp}</p>
          <button type="submit" disabled={invitePending || relativeEmail.trim() === ""}>
            {es.inviteTitle}
          </button>
        </form>
      ) : null}
      {people && !isOwner ? (
        <>
          <p className="muted">{es.familyOwnerOnly}</p>
          <button type="button" disabled={busy} onClick={() => void leaveHousehold()}>
            {es.familyLeave}
          </button>
        </>
      ) : null}
      {inviteSent ? <p>{es.inviteSent}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
