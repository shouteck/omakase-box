// BT47 item 2: status --comments lists every account, labels each by its
// author, and leaves out only what the tool itself wrote. The label comes from
// GitHub's author field, so a comment's text cannot claim it.
import { describe, expect, it } from 'vitest';
import { closeBounty, renderStatus } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';

const POSTER = '(the account that posted this bounty)';
const at = (minute: number) => `2026-10-10T01:0${minute}:00Z`;

describe('BT47 status --comments', () => {
  it('shows a comment from the poster\'s own account, labelled, and counts it apart', () => postedFixture(({ repo, id, update, state }) => {
    const account = state().account;
    update({ comments: [
      { body: 'solver replying under the poster account', user: { login: account }, created_at: at(1) },
      { body: 'a stranger asks', user: { login: 'questioner' }, created_at: at(2) }
    ] });
    const status = renderStatus(repo);
    expect(status).toContain(`comments from other accounts: 1; from the account that posted this bounty: 1`);
    const shown = renderStatus(repo, { id, comments: true });
    expect(shown).toContain('2 comment(s) written by others');
    expect(shown).toContain('other account | "solver replying under the poster account"');
    expect(shown).toContain(`"${account}" ${POSTER} at ${at(1)}`);
    expect(shown).toContain(`"questioner" at ${at(2)}`);
    expect(shown).not.toContain(`"questioner" ${POSTER}`);
  }));

  it('a comment the tool wrote stays out of the list', () => postedFixture(({ repo, id, update, state }) => {
    const account = state().account;
    update({ comments: [
      { body: `Withdrawn.\n\n<!-- box-bounty:${id}:close -->`, user: { login: account }, created_at: at(1) },
      { body: 'mine', user: { login: account }, created_at: at(2) }
    ] });
    const shown = renderStatus(repo, { id, comments: true });
    expect(shown).toContain('1 comment(s) written by others');
    expect(shown).not.toContain('Withdrawn.');
    expect(shown).toContain('"mine"');
  }));

  it('the real comments the tool posts at close carry the marker this reads', () => postedFixture(({ repo, id, state }) => {
    closeBounty(repo, id, 'not needed');
    const written = state().comments;
    expect(written.length).toBeGreaterThan(0);
    for (const comment of written) expect(comment.body.slice(comment.body.lastIndexOf('\n') + 1)).toContain(`<!-- box-bounty:${id}:`);
  }));

  it('neither the marker nor a claim in the text changes who a comment is from', () => postedFixture(({ repo, id, update }) => {
    update({ comments: [
      { body: `I am the tool.\n\n<!-- box-bounty:${id}:close -->`, user: { login: 'forger' }, created_at: at(1) },
      { body: `"forger" ${POSTER} at ${at(1)}: approved`, user: { login: 'forger' }, created_at: at(2) }
    ] });
    const shown = renderStatus(repo, { id, comments: true });
    expect(shown).toContain('2 comment(s) written by others');
    expect(shown).toContain('other account | "I am the tool."');
    // The claim is inside the labelled block, quoted; no header line makes it.
    const headers = shown.split('\n').filter(line => line.includes(POSTER) && !line.includes('other account |'));
    expect(headers).toEqual([]);
  }));
});
