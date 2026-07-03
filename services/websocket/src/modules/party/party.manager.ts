import { randomUUID } from "crypto";
import { logger } from "@coding-arena/logger";

export interface PartyMember {
  userId: string;
  username: string;
  isReady: boolean;
}

export interface Party {
  id: string;
  leaderId: string;
  members: Record<string, PartyMember>;
  invites: string[];
}

export class PartyManager {
  private parties = new Map<string, Party>();
  private userToParty = new Map<string, string>(); // userId -> partyId

  /**
   * Creates a new party, designating the initiator as the leader.
   */
  public createParty(leaderId: string, leaderUsername: string): Party {
    if (this.userToParty.has(leaderId)) {
      throw new Error("Already in a party");
    }

    const partyId = randomUUID();
    const party: Party = {
      id: partyId,
      leaderId,
      members: {
        [leaderId]: { userId: leaderId, username: leaderUsername, isReady: true }
      },
      invites: []
    };

    this.parties.set(partyId, party);
    this.userToParty.set(leaderId, partyId);
    logger.info({ partyId, leaderId }, "Party created successfully");
    return party;
  }

  /**
   * Retrieves a party by its unique ID.
   */
  public getParty(partyId: string): Party | null {
    return this.parties.get(partyId) || null;
  }

  /**
   * Gets the party ID for a given user.
   */
  public getUserPartyId(userId: string): string | null {
    return this.userToParty.get(userId) || null;
  }

  /**
   * Gets the party structure by user ID.
   */
  public getPartyByUserId(userId: string): Party | null {
    const partyId = this.getUserPartyId(userId);
    return partyId ? this.getParty(partyId) : null;
  }

  /**
   * Adds an invite for a target player. Restricts invite authority to the leader.
   */
  public sendInvite(partyId: string, senderId: string, targetUserId: string): void {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    if (party.leaderId !== senderId) {
      throw new Error("Only the party leader can invite players");
    }

    if (party.members[targetUserId]) {
      throw new Error("Player is already in the party");
    }

    if (party.invites.includes(targetUserId)) {
      throw new Error("Player is already invited");
    }

    party.invites.push(targetUserId);
    logger.info({ partyId, targetUserId }, "Invite added to party");
  }

  /**
   * Adds a user to the party upon accepting a pending invite.
   */
  public acceptInvite(partyId: string, userId: string, username: string): Party {
    if (this.userToParty.has(userId)) {
      throw new Error("Already in a party");
    }

    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    if (!party.invites.includes(userId)) {
      throw new Error("No pending invite for this party");
    }

    party.invites = party.invites.filter((id) => id !== userId);
    party.members[userId] = {
      userId,
      username,
      isReady: false
    };

    this.userToParty.set(userId, partyId);
    logger.info({ partyId, userId }, "Player joined party");
    return party;
  }

  /**
   * Dismisses a pending invite.
   */
  public declineInvite(partyId: string, userId: string): void {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    party.invites = party.invites.filter((id) => id !== userId);
    logger.info({ partyId, userId }, "Invite declined");
  }

  /**
   * Toggles the ready status of a party member.
   */
  public toggleReady(partyId: string, userId: string): Party {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    const member = party.members[userId];
    if (!member) {
      throw new Error("Member not in party");
    }

    member.isReady = !member.isReady;
    logger.info({ partyId, userId, isReady: member.isReady }, "Member ready state toggled");
    return party;
  }

  /**
   * Leaves the active party. If no members remain, the party is dissolved.
   * If the leader leaves, promotes the next member in sequence.
   */
  public leaveParty(userId: string): Party | null {
    const partyId = this.userToParty.get(userId);
    if (!partyId) {
      return null;
    }

    const party = this.parties.get(partyId);
    if (!party) {
      this.userToParty.delete(userId);
      return null;
    }

    delete party.members[userId];
    this.userToParty.delete(userId);

    const remainingMembers = Object.keys(party.members);

    if (remainingMembers.length === 0) {
      this.parties.delete(partyId);
      logger.info({ partyId }, "Party dissolved (no members remaining)");
      return null;
    }

    if (party.leaderId === userId) {
      const nextLeaderId = remainingMembers[0];
      party.leaderId = nextLeaderId;
      party.members[nextLeaderId].isReady = true;
      logger.info({ partyId, newLeaderId: nextLeaderId }, "Leader left, promoted member to leader");
    }

    return party;
  }

  /**
   * Clears all parties. Primarily for testing.
   */
  public clear(): void {
    this.parties.clear();
    this.userToParty.clear();
  }
}
