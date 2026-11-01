import { CmsRequestError, cmsRequest, resolveSubmission } from '@/lib/cms-client';
import type { CmsRole, CmsUser } from '@/lib/cms-roles';
import type { MediaItem } from '@/lib/cms-types';
import type { UserPhotoDraft } from './CmsUserPhotoDialog';

type CreateInput = { username: string; password: string; role: CmsRole; currentPassword: string };
type CreatePayload = CreateInput & { submissionId: string; avatar?: string };
const uncertainResponse = (error: unknown) => !(error instanceof CmsRequestError) || error.status === 0 || error.status >= 500;

/** One Add-user attempt owns one submission and its local image preview. */
export class CmsNewUserDraft {
  photo: UserPhotoDraft = { avatar: '' };
  uncertain = false;
  private submissionId = '';
  private staged: MediaItem | null = null;
  private candidate: CreatePayload | null = null;
  private accepted = false;
  private disposed = false;
  private photoInvolved = false;

  get hasSubmission() { return Boolean(this.submissionId); }

  setPhoto(photo: UserPhotoDraft) {
    if (this.photo.prepared && this.photo.prepared !== photo.prepared) URL.revokeObjectURL(this.photo.prepared.preview);
    this.photo = photo;
  }

  async discardSubmission() {
    if (this.submissionId && this.photoInvolved && !this.accepted) await resolveSubmission(this.submissionId, 'abort');
    this.submissionId = ''; this.staged = null; this.candidate = null; this.uncertain = false;
    this.photoInvolved = false;
  }

  dispose() {
    this.disposed = true;
    if (this.photo.prepared) URL.revokeObjectURL(this.photo.prepared.preview);
    this.photo = { avatar: '' };
    if (this.submissionId && this.photoInvolved && !this.accepted) void resolveSubmission(this.submissionId, 'abort').catch(() => {});
    this.candidate = null;
  }

  async submit(input: CreateInput, progress: (title: string) => void): Promise<CmsUser> {
    if (this.disposed) throw new Error('This add-user dialog is closed. Open it again to continue.');
    if (!this.submissionId) this.submissionId = crypto.randomUUID();
    if (!this.uncertain) {
      let avatar = this.photo.avatar;
      // Both a library photo and a device upload use the backend media fence.
      // Set this before uploading so a lost upload response is still cleaned up.
      this.photoInvolved = Boolean(avatar || this.photo.prepared);
      if (this.photo.prepared) {
        if (!this.staged) {
          progress('Uploading photo…');
          const body = new FormData();
          body.set('file', this.photo.prepared.blob, this.photo.prepared.filename);
          body.set('submissionId', this.submissionId);
          // Upload IDs are deterministic for actor, submission and file bytes.
          // Retrying a lost upload response returns that same staged image.
          const result = await cmsRequest<{ media: MediaItem }>('/api/cms/media', { method: 'POST', body });
          this.staged = result.media;
        }
        avatar = this.staged.url;
      }
      if (this.disposed) {
        if (this.photoInvolved) void resolveSubmission(this.submissionId, 'abort').catch(() => {});
        throw new Error('This add-user dialog is closed. Open it again to continue.');
      }
      this.candidate = { ...input, submissionId: this.submissionId, ...(avatar ? { avatar } : {}) };
    }
    const payload = this.candidate!;
    const write = () => cmsRequest<{ user: CmsUser }>('/api/cms/users', { method: 'POST', body: JSON.stringify(payload) });
    progress(this.uncertain ? 'Checking added user…' : 'Adding user…');
    try {
      let result: { user: CmsUser };
      try { result = await write(); }
      catch (error) {
        if (!this.uncertain && !uncertainResponse(error)) { this.candidate = null; throw error; }
        this.uncertain = true;
        if (this.disposed) throw error;
        // The server's actor+submission receipt confirms ownership. Replaying
        // the exact request is stronger than accepting a username lookalike.
        progress('Checking added user…');
        result = await write();
      }
      this.accepted = true; this.uncertain = false; this.candidate = null;
      return result.user;
    } catch (error) {
      if (this.disposed && this.photoInvolved && !this.accepted) void resolveSubmission(this.submissionId, 'abort').catch(() => {});
      throw error;
    }
  }
}
