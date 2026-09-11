(() => {
  const API_BASE = String(window.DDP_API || '/api').replace(/\/$/, '');

  const KEYS = {
    identity: 'ddp_identity_v4',
    appearance: 'ddp_appearance_v3',
    fallbackPosts: 'ddp_posts_fallback_v3',
    hiddenPosts: 'ddp_hidden_posts_v1'
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const uid = (prefix = 'id') =>
    `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  // =========================
  // STORAGE
  // =========================

  function getJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be disabled or full.
    }
  }

  // =========================
  // IDENTITY
  // =========================

  function currentIdentity() {
    let identity = getJSON(KEYS.identity, null);

    if (!identity?.id) {
      identity = {
        id: uid('guest'),
        name: 'Anonymous'
      };

      setJSON(KEYS.identity, identity);
    }

    return identity;
  }

  // =========================
  // SECURITY / HTML
  // =========================

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  // =========================
  // SWEARING FILTER
  // =========================

  const SWEAR_WORDS = [
    'fuck',
    'fucking',
    'fucked',
    'shit',
    'shitty',
    'bullshit',
    'bitch',
    'bastard',
    'asshole',
    'dumbass',
    'jackass',
    'damn',
    'crap',
    'hell'
  ];

  function maskSwearing(value) {
    let text = String(value ?? '');

    for (const word of SWEAR_WORDS) {
      const pattern = new RegExp(
        `\\b${word}\\b`,
        'gi'
      );

      text = text.replace(
        pattern,
        match => '*'.repeat(match.length)
      );
    }

    return text;
  }

  function safeText(value) {
    return escapeHTML(maskSwearing(value));
  }

  function safeMultilineText(value) {
    return safeText(value).replace(/\n/g, '<br>');
  }

  // =========================
  // DATE
  // =========================

  function formatDate(timestamp) {
    const date = new Date(timestamp);

    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString([], {
          dateStyle: 'medium',
          timeStyle: 'short'
        });
  }

  // =========================
  // LOCAL POSTS
  // =========================

  function localPosts() {
    const posts = getJSON(
      KEYS.fallbackPosts,
      []
    );

    return Array.isArray(posts)
      ? posts
      : [];
  }

  // =========================
  // HIDDEN POSTS
  // =========================

  function hiddenPosts() {
    const posts = getJSON(
      KEYS.hiddenPosts,
      []
    );

    return Array.isArray(posts)
      ? posts
      : [];
  }

  function hideLocalPost(postId) {
    const ids = new Set(hiddenPosts());

    ids.add(String(postId));

    setJSON(
      KEYS.hiddenPosts,
      [...ids]
    );
  }

  function isLocallyHidden(postId) {
    return hiddenPosts().includes(
      String(postId)
    );
  }

  // =========================
  // API
  // =========================

  async function api(path, options = {}) {
    const identity = currentIdentity();

    const headers = {
      Accept: 'application/json',

      'X-DDP-User-ID': identity.id,

      'X-DDP-User-Name': identity.name || 'Anonymous',

      ...(options.body !== undefined
        ? {
            'Content-Type': 'application/json'
          }
        : {}),

      ...(options.headers || {})
    };

    let response;

    try {
      response = await fetch(
        API_BASE + path,
        {
          ...options,
          headers,
          credentials: 'same-origin'
        }
      );
    } catch {
      const error = new Error(
        'Backend unavailable. Start the Node.js server and try again.'
      );

      error.code = 'NETWORK_ERROR';

      throw error;
    }

    let data = {};

    try {
      data = await response.json();
    } catch {
      // Server may have returned non-JSON.
    }

    if (!response.ok) {
      const error = new Error(
        data.error ||
        `Request failed (${response.status})`
      );

      error.status = response.status;

      throw error;
    }

    return data;
  }

  // =========================
  // APPEARANCE
  // =========================

  function applyAppearance() {
    const value =
      localStorage.getItem(
        KEYS.appearance
      ) || 'system';

    const dark =
      value === 'dark' ||
      (
        value === 'system' &&
        window.matchMedia?.(
          '(prefers-color-scheme: dark)'
        ).matches
      );

    document.documentElement.classList.toggle(
      'dark',
      Boolean(dark)
    );

    document.documentElement.dataset.appearance =
      value;
  }

  function setAppearance(value) {
    if (
      ![
        'light',
        'dark',
        'system'
      ].includes(value)
    ) {
      return;
    }

    localStorage.setItem(
      KEYS.appearance,
      value
    );

    applyAppearance();

    $$('[data-appearance]').forEach(
      input => {
        input.checked =
          input.dataset.appearance ===
          value;
      }
    );
  }

  // =========================
  // NAVIGATION
  // =========================

  function makeNav(active = 'home') {
    const items = [
      [
        'home',
        '/frontend/pages/home.html',
        '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/></svg>',
        'Feed'
      ],

      [
        'mine',
        '/frontend/pages/myPosts.html',
        '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-120v-720h720v720H120Zm600-160H240v60h480v-60Zm-480-60h480v-60H240v60Zm0-140h480v-240H240v240Zm0 200v60-60Zm0-60v-60 60Zm0-140v-240 240Zm0 80v-80 80Zm0 120v-60 60Z"/></svg>',
        'My Posts'
      ],

      [
        'saved',
        '/frontend/pages/savedPosts.html',
        '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M160-80v-560q0-33 23.5-56.5T240-720h320q33 0 56.5 23.5T640-640v560L400-200 160-80Zm80-121 160-86 160 86v-439H240v439Zm480-39v-560H280v-80h440q33 0 56.5 23.5T800-800v560h-80ZM240-640h320-320Z"/></svg>',
        'Saved'
      ],

      [
        'notif',
        '/frontend/pages/notif-settings/notif.html',
        '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-792q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z"/></svg>',
        'Notif'
      ]
    ];

    return `
      <nav class="btmNav">
        ${items
          .map(
            ([id, href, icon, label]) => `
              <a
                href="${href}"
                class="navIcons ${
                  active === id
                    ? 'active'
                    : ''
                }"
              >
                <span class="navIcon">
                  ${icon}
                </span>

                <span class="navText">
                  ${label}
                </span>
              </a>
            `
          )
          .join('')}
      </nav>
    `;
  }

  // =========================
  // FILTER POSTS
  // =========================

  function filterPosts(posts, query) {
    const q = String(query || '')
      .trim()
      .toLowerCase();

    return posts
      .filter(
        post =>
          !isLocallyHidden(post.id)
      )
      .filter(post => {
        const searchable = [
          post.topic || '',
          post.content || '',
          post.authorName || ''
        ]
          .join(' ')
          .toLowerCase();

        return !q ||
          searchable.includes(q);
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );
  }

  // =========================
  // LOAD POSTS
  // =========================

  async function loadPosts(query = '') {
    try {
      const data = await api(
        '/posts' +
          (
            query
              ? `?q=${encodeURIComponent(query)}`
              : ''
          )
      );

      const posts =
        Array.isArray(data.posts)
          ? data.posts
          : [];

      return filterPosts(
        posts,
        query
      );
    } catch (error) {
      if (localPosts().length) {
        return filterPosts(
          localPosts(),
          query
        );
      }

      throw error;
    }
  }

  // =========================
  // REPORT OPTIONS
  // =========================

  const REPORT_OPTIONS = [
    'Spam',
    'Harassment or bullying',
    'Hate speech',
    'Threats or violence',
    'Sexual or inappropriate content',
    'Misinformation',
    'Other'
  ];

  // =========================
  // CLOSE MENUS
  // =========================

  function closeActionMenus() {
    $$('.ddpActionMenu').forEach(
      menu => menu.remove()
    );
  }

  document.addEventListener(
    'click',
    event => {
      if (
        !event.target.closest(
          '.ddpActionMenu'
        ) &&
        !event.target.closest(
          '[data-more]'
        ) &&
        !event.target.closest(
          '[data-comment-more]'
        )
      ) {
        closeActionMenus();
      }
    }
  );

  // =========================
  // ACTION MENU
  // =========================

  function createActionMenu(
    anchor,
    actions
  ) {
    closeActionMenus();

    const menu =
      document.createElement('div');

    menu.className =
      'ddpActionMenu';

    menu.style.position =
      'absolute';

    menu.style.right =
      '0';

    menu.style.top =
      'calc(100% + 6px)';

    menu.style.zIndex =
      '1000';

    menu.style.minWidth =
      '160px';

    menu.style.padding =
      '6px';

    menu.style.borderRadius =
      '10px';

    menu.style.background =
      'var(--card-bg, #fff)';

    menu.style.border =
      '1px solid var(--border, #ddd)';

    menu.style.boxShadow =
      '0 8px 24px rgba(0,0,0,.15)';

    actions.forEach(action => {
      const button =
        document.createElement('button');

      button.type =
        'button';

      button.textContent =
        action.label;

      button.style.display =
        'block';

      button.style.width =
        '100%';

      button.style.padding =
        '10px 12px';

      button.style.border =
        '0';

      button.style.background =
        'transparent';

      button.style.textAlign =
        'left';

      button.style.cursor =
        'pointer';

      button.addEventListener(
        'click',
        async event => {
          event.stopPropagation();

          closeActionMenus();

          try {
            await action.action();
          } catch (error) {
            alert(
              error.message ||
              'Something went wrong.'
            );
          }
        }
      );

      menu.appendChild(button);
    });

    const parent =
      anchor.parentElement;

    if (
      parent &&
      getComputedStyle(parent).position ===
        'static'
    ) {
      parent.style.position =
        'relative';
    }

    parent?.appendChild(menu);
  }

  // =========================
  // REPORT MENU
  // =========================

  function showReportMenu({
    title,
    submit
  }) {
    closeActionMenus();

    const wrapper =
      document.createElement('div');

    wrapper.className =
      'ddpActionMenu';

    wrapper.style.position =
      'fixed';

    wrapper.style.left =
      '50%';

    wrapper.style.top =
      '50%';

    wrapper.style.transform =
      'translate(-50%, -50%)';

    wrapper.style.zIndex =
      '9999';

    wrapper.style.width =
      'min(90vw, 360px)';

    wrapper.style.maxHeight =
      '80vh';

    wrapper.style.overflow =
      'auto';

    wrapper.style.padding =
      '18px';

    wrapper.style.borderRadius =
      '14px';

    wrapper.style.background =
      'var(--card-bg, #fff)';

    wrapper.style.border =
      '1px solid var(--border, #ddd)';

    wrapper.style.boxShadow =
      '0 15px 40px rgba(0,0,0,.25)';

    const heading =
      document.createElement('h3');

    heading.textContent =
      title || 'Report';

    heading.style.marginTop =
      '0';

    wrapper.appendChild(
      heading
    );

    const description =
      document.createElement('p');

    description.textContent =
      'Choose a reason:';

    wrapper.appendChild(
      description
    );

    REPORT_OPTIONS.forEach(
      reason => {
        const button =
          document.createElement('button');

        button.type =
          'button';

        button.textContent =
          reason;

        button.style.display =
          'block';

        button.style.width =
          '100%';

        button.style.padding =
          '11px';

        button.style.margin =
          '6px 0';

        button.style.borderRadius =
          '8px';

        button.style.cursor =
          'pointer';

        button.addEventListener(
          'click',
          async () => {
            let finalReason =
              reason;

            if (reason === 'Other') {
              const details =
                prompt(
                  'Please describe the reason:'
                );

              if (!details?.trim()) {
                return;
              }

              finalReason =
                `Other: ${details.trim()}`;
            }

            wrapper.remove();

            try {
              await submit(
                finalReason
              );

              alert(
                'Report submitted. Thank you.'
              );
            } catch (error) {
              alert(
                error.message ||
                'Unable to submit report.'
              );
            }
          }
        );

        wrapper.appendChild(
          button
        );
      }
    );

    const cancel =
      document.createElement('button');

    cancel.type =
      'button';

    cancel.textContent =
      'Cancel';

    cancel.style.display =
      'block';

    cancel.style.width =
      '100%';

    cancel.style.padding =
      '11px';

    cancel.style.marginTop =
      '10px';

    cancel.addEventListener(
      'click',
      () => wrapper.remove()
    );

    wrapper.appendChild(
      cancel
    );

    document.body.appendChild(
      wrapper
    );
  }

  // =========================
  // COMMENTS HTML
  // =========================

  function commentHTML(post) {
    const comments =
      Array.isArray(post.comments)
        ? post.comments
        : [];

    const me =
      currentIdentity();

    return `
      <div class="comments">

        <div class="commentList">

          ${
            comments.length
              ? comments
                  .map(comment => {
                    const isMine =
                      comment.userId === me.id ||
                      comment.authorId === me.id ||
                      comment.ownerId === me.id;

                    return `
                      <div
                        class="comment"
                        data-comment-id="${escapeHTML(
                          comment.id || ''
                        )}"
                      >

                        <div class="commentContent">

                          <b>
                            ${safeText(
                              comment.name ||
                              comment.authorName ||
                              'Anonymous'
                            )}
                          </b>

                          <span class="commentText">
                            ${safeText(
                              comment.text ||
                              comment.content ||
                              ''
                            )}
                          </span>

                          ${
                            comment.updatedAt
                              ? `
                                <small class="muted">
                                  · edited
                                </small>
                              `
                              : ''
                          }

                        </div>

                        <button
                          type="button"
                          class="commentMoreBtn"
                          data-comment-more="${escapeHTML(
                            post.id
                          )}"
                          data-comment-id="${escapeHTML(
                            comment.id || ''
                          )}"
                          aria-label="Comment options"
                        >
                          ⋯
                        </button>

                        ${
                          isMine
                            ? `
                              <span
                                class="commentOwner"
                                data-comment-owner="${escapeHTML(
                                  comment.id || ''
                                )}"
                                hidden
                              ></span>
                            `
                            : ''
                        }

                      </div>
                    `;
                  })
                  .join('')
              : `
                <small class="muted">
                  No comments yet.
                </small>
              `
          }

        </div>

        <form
          class="commentForm"
          data-comment-form="${escapeHTML(
            post.id
          )}"
        >

          <input
            name="comment"
            maxlength="300"
            placeholder="Write a comment..."
            required
          >

          <button type="submit">
            Send
          </button>

        </form>

      </div>
    `;
  }

  // =========================
  // POLL
  // =========================

  function pollBody(post) {
    const options =
      Array.isArray(post.options)
        ? post.options
        : [];

    const total =
      options.reduce(
        (sum, option) =>
          sum +
          Number(option.votes || 0),
        0
      );

    const me =
      currentIdentity();

    const voted =
      post.voters?.[me.id];

    return `
      <div class="pollBody">

        <div class="pollOptions">

          ${options
            .map(
              (option, index) => {
                const votes =
                  Number(
                    option.votes || 0
                  );

                const percentage =
                  total
                    ? Math.round(
                        votes /
                        total *
                        100
                      )
                    : 0;

                const chosen =
                  voted === index;

                const disabled =
                  voted !== undefined;

                return `
                  <button
                    type="button"
                    class="pollOption ${
                      chosen
                        ? 'chosen'
                        : ''
                    }"
                    data-vote="${escapeHTML(
                      post.id
                    )}"
                    data-option="${index}"
                    ${
                      disabled
                        ? 'disabled'
                        : ''
                    }
                  >

                    <span
                      class="pollBar"
                      style="width:${percentage}%"
                    ></span>

                    <span class="pollLabel">
                      ${safeText(
                        option.text
                      )}
                    </span>

                    <strong>
                      ${percentage}%
                    </strong>

                  </button>
                `;
              }
            )
            .join('')}

        </div>

        <small class="pollTotal">
          ${total}
          vote${total === 1 ? '' : 's'}
        </small>

      </div>
    `;
  }

  // =========================
  // POST CARD
  // =========================

  function postCard(post) {
    const me =
      currentIdentity();

    const reacted =
      post.reacted ??
      (post.reactions || [])
        .includes(me.id);

    const saved =
      post.saved ??
      (post.savedBy || [])
        .includes(me.id);

    const isMine =
      post.authorId === me.id ||
      post.userId === me.id ||
      post.ownerId === me.id;

    const author =
      post.authorName ||
      'Anonymous';

    const initial =
      author.charAt(0).toUpperCase() ||
      '?';

    return `
      <article
        class="feedCard"
        data-post="${escapeHTML(
          post.id
        )}"
      >

        <div class="postHeader">

          <div class="avatar">
            ${escapeHTML(initial)}
          </div>

          <div class="authorMeta">

            <b>
              ${safeText(author)}
            </b>

            <small>
              ${formatDate(
                post.createdAt
              )}

              ${
                post.updatedAt
                  ? ' · edited'
                  : ''
              }

              ${
                post.type === 'poll'
                  ? ' · Poll'
                  : ''
              }
            </small>

          </div>

          <div
            class="postMenuWrap"
            style="position:relative"
          >

            <button
              type="button"
              class="moreBtn"
              data-more="${escapeHTML(
                post.id
              )}"
              aria-label="More"
            >
              ⋯
            </button>

          </div>

        </div>

        ${
          post.topic
            ? `
              <h3>
                ${safeText(
                  post.topic
                )}
              </h3>
            `
            : ''
        }

        ${
          post.type === 'poll'
            ? pollBody(post)
            : `
              ${
                post.content
                  ? `
                    <p class="postContent">
                      ${safeMultilineText(
                        post.content
                      )}
                    </p>
                  `
                  : ''
              }

              ${
                post.image
                  ? `
                    <img
                      class="postImage"
                      src="${escapeHTML(
                        post.image
                      )}"
                      alt="Uploaded image"
                      loading="lazy"
                    >
                  `
                  : ''
              }
            `
        }

        <div class="postActions">

          <button
            type="button"
            class="${
              reacted
                ? 'reacted'
                : ''
            }"
            data-react="${escapeHTML(
              post.id
            )}"
            aria-label="React"
          >

            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
            </svg>

            <span>
              ${
                post.reactionCount ??
                post.reactions?.length ??
                0
              }
            </span>

          </button>

          <button
            type="button"
            data-toggle-comments="${escapeHTML(
              post.id
            )}"
            aria-label="Comments"
          >

            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>

            <span>
              ${
                post.comments?.length ||
                0
              }
            </span>

          </button>

          <button
            type="button"
            class="${
              saved
                ? 'saved'
                : ''
            }"
            data-save="${escapeHTML(
              post.id
            )}"
            aria-label="Save"
          >

            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 -960 960 960"
              width="24px"
              fill="currentColor"
            >
              <path d="M160-80v-560q0-33 23.5-56.5T240-720h320q33 0 56.5 23.5T640-640v560L400-200 160-80Zm80-121 160-86 160 86v-439H240v439Zm480-39v-560H280v-80h440q33 0 56.5 23.5T800-800v560h-80ZM240-640h320-320Z"/>
            </svg>

          </button>

        </div>

        <div
          data-comments="${escapeHTML(
            post.id
          )}"
          class="commentWrap hidden"
        >
          ${commentHTML(post)}
        </div>

      </article>
    `;
  }

  // =========================
  // ERROR
  // =========================

  function renderError(
    container,
    error
  ) {
    const message =
      error?.message ||
      'Unable to load posts.';

    container.innerHTML = `
      <div class="emptyState">
        ${escapeHTML(message)}
      </div>
    `;
  }

  // =========================
  // RENDER FEED
  // =========================

  async function renderFeed(
    container,
    filter = 'all',
    query = ''
  ) {
    if (!container) return;

    container.dataset.filter =
      filter;

    container.dataset.query =
      query;

    container.innerHTML =
      '<div class="emptyState">Loading posts…</div>';

    try {
      let posts =
        await loadPosts(query);

      if (filter === 'mine') {
        posts =
          posts.filter(
            post =>
              post.authorId ===
                currentIdentity().id ||
              post.userId ===
                currentIdentity().id ||
              post.ownerId ===
                currentIdentity().id
          );
      }

      if (filter === 'saved') {
        posts =
          posts.filter(
            post => post.saved
          );
      }

      container._ddpPosts =
        posts;

      container.innerHTML =
        posts.length
          ? posts
              .map(postCard)
              .join('')
          : `
              <div class="emptyState">
                ${
                  query
                    ? 'No matching posts.'
                    : 'No posts yet. Be the first to share something.'
                }
              </div>
            `;

      bindFeed(container);
    } catch (error) {
      renderError(
        container,
        error
      );
    }
  }

  async function refreshFeed(
    container
  ) {
    await renderFeed(
      container,
      container.dataset.filter ||
        'all',
      container.dataset.query ||
        ''
    );
  }

  // =========================
  // EDIT POST
  // =========================

  async function editPost(
    postId,
    container
  ) {
    let posts;

    try {
      posts =
        await loadPosts();
    } catch (error) {
      alert(error.message);
      return;
    }

    const post =
      posts.find(
        item =>
          String(item.id) ===
          String(postId)
      );

    if (!post) {
      alert('Post not found.');
      return;
    }

    const me =
      currentIdentity();

    const isMine =
      post.authorId === me.id ||
      post.userId === me.id ||
      post.ownerId === me.id;

    if (!isMine) {
      alert(
        'You can only edit your own post.'
      );
      return;
    }

    const topic =
      prompt(
        post.type === 'poll'
          ? 'Edit poll question:'
          : 'Edit post topic:',
        post.topic || ''
      );

    if (topic === null) return;

    if (post.type === 'post') {
      const content =
        prompt(
          'Edit post content:',
          post.content || ''
        );

      if (content === null) return;

      try {
        await api(
          `/posts/${encodeURIComponent(
            postId
          )}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              topic:
                maskSwearing(
                  topic.trim()
                ),
              content:
                maskSwearing(
                  content.trim()
                )
            })
          }
        );

        await refreshFeed(
          container
        );
      } catch (error) {
        alert(error.message);
      }

      return;
    }

    const hasVotes =
      (post.options || [])
        .some(
          option =>
            Number(
              option.votes || 0
            ) > 0
        );

    let options =
      (post.options || [])
        .map(
          option =>
            option.text
        );

    if (!hasVotes) {
      const edited = [];

      for (
        const option of options
      ) {
        const value =
          prompt(
            'Edit option:',
            option
          );

        if (value === null) {
          return;
        }

        edited.push(
          maskSwearing(
            value.trim()
          )
        );
      }

      options = edited;
    }

    try {
      await api(
        `/posts/${encodeURIComponent(
          postId
        )}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            topic:
              maskSwearing(
                topic.trim()
              ),

            ...(hasVotes
              ? {}
              : { options })
          })
        }
      );

      await refreshFeed(
        container
      );
    } catch (error) {
      alert(error.message);
    }
  }

  // =========================
  // DELETE POST
  // =========================

  async function deletePost(
    postId,
    container
  ) {
    const confirmed =
      confirm(
        'Delete this post? This cannot be undone.'
      );

    if (!confirmed) return;

    try {
      await api(
        `/posts/${encodeURIComponent(
          postId
        )}`,
        {
          method: 'DELETE'
        }
      );

      await refreshFeed(
        container
      );
    } catch (error) {
      alert(error.message);
    }
  }

  // =========================
  // EDIT COMMENT
  // =========================

  async function editComment(
    postId,
    commentId,
    container
  ) {
    if (!commentId) {
      alert(
        'This comment does not have a valid ID.'
      );
      return;
    }

    const comments =
      await findPostComments(
        postId
      );

    const comment =
      comments.find(
        item =>
          String(item.id) ===
          String(commentId)
      );

    if (!comment) {
      alert(
        'Comment not found.'
      );
      return;
    }

    const me =
      currentIdentity();

    const isMine =
      comment.userId === me.id ||
      comment.authorId === me.id ||
      comment.ownerId === me.id;

    if (!isMine) {
      alert(
        'You can only edit your own comment.'
      );
      return;
    }

    const oldText =
      comment.text ||
      comment.content ||
      '';

    const text =
      prompt(
        'Edit your comment:',
        oldText
      );

    if (text === null) return;

    const cleaned =
      maskSwearing(
        text.trim()
      );

    if (!cleaned) {
      alert(
        'Comment cannot be empty.'
      );
      return;
    }

    try {
      // FIXED:
      // Backend route is /api/comments/:commentId
      await api(
        `/comments/${encodeURIComponent(
          commentId
        )}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            text: cleaned
          })
        }
      );

      await refreshFeed(
        container
      );
    } catch (error) {
      alert(error.message);
    }
  }

  // =========================
  // DELETE COMMENT
  // =========================

  async function deleteComment(
    postId,
    commentId,
    container
  ) {
    if (!commentId) {
      alert(
        'This comment does not have a valid ID.'
      );
      return;
    }

    const confirmed =
      confirm(
        'Delete this comment? This cannot be undone.'
      );

    if (!confirmed) return;

    try {
      // FIXED:
      // Backend route is /api/comments/:commentId
      await api(
        `/comments/${encodeURIComponent(
          commentId
        )}`,
        {
          method: 'DELETE'
        }
      );

      await refreshFeed(
        container
      );
    } catch (error) {
      alert(error.message);
    }
  }

  // =========================
  // FIND POST COMMENTS
  // =========================

  async function findPostComments(
    postId
  ) {
    try {
      const posts =
        await loadPosts();

      const post =
        posts.find(
          item =>
            String(item.id) ===
            String(postId)
        );

      return Array.isArray(
        post?.comments
      )
        ? post.comments
        : [];
    } catch {
      return [];
    }
  }

  // =========================
  // BIND FEED
  // =========================

  function bindFeed(container) {

    // =====================
    // REACT
    // =====================

    $$(
      '[data-react]',
      container
    ).forEach(button => {
      button.onclick =
        async () => {
          button.disabled =
            true;

          try {
            await api(
              `/posts/${encodeURIComponent(
                button.dataset.react
              )}/react`,
              {
                method: 'POST'
              }
            );

            await refreshFeed(
              container
            );
          } catch (error) {
            button.disabled =
              false;

            alert(
              error.message
            );
          }
        };
    });

    // =====================
    // SAVE
    // =====================

    $$(
      '[data-save]',
      container
    ).forEach(button => {
      button.onclick =
        async () => {
          button.disabled =
            true;

          try {
            await api(
              `/posts/${encodeURIComponent(
                button.dataset.save
              )}/save`,
              {
                method: 'POST'
              }
            );

            await refreshFeed(
              container
            );
          } catch (error) {
            button.disabled =
              false;

            alert(
              error.message
            );
          }
        };
    });

    // =====================
    // COMMENTS TOGGLE
    // =====================

    $$(
      '[data-toggle-comments]',
      container
    ).forEach(button => {
      button.onclick =
        () => {
          const target =
            $(
              `[data-comments="${CSS.escape(
                button.dataset
                  .toggleComments
              )}"]`,
              container
            );

          target?.classList.toggle(
            'hidden'
          );
        };
    });

    // =====================
    // COMMENT FORM
    // =====================

    $$(
      '[data-comment-form]',
      container
    ).forEach(form => {
      form.onsubmit =
        async event => {
          event.preventDefault();

          const input =
            $(
              'input[name=comment]',
              form
            );

          const commentText =
            input?.value.trim() ||
            '';

          if (!commentText) {
            return;
          }

          const submit =
            $(
              'button[type=submit]',
              form
            );

          if (submit) {
            submit.disabled =
              true;
          }

          try {
            await api(
              `/posts/${encodeURIComponent(
                form.dataset
                  .commentForm
              )}/comments`,
              {
                method: 'POST',

                body: JSON.stringify({
                  text:
                    maskSwearing(
                      commentText
                    )
                })
              }
            );

            const postId =
              form.dataset
                .commentForm;

            await refreshFeed(
              container
            );

            $(
              `[data-comments="${CSS.escape(
                postId
              )}"]`,
              container
            )?.classList.remove(
              'hidden'
            );
          } catch (error) {
            if (submit) {
              submit.disabled =
                false;
            }

            alert(
              error.message
            );
          }
        };
    });

    // =====================
    // POLL VOTE
    // =====================

    $$(
      '[data-vote]',
      container
    ).forEach(button => {
      button.onclick =
        async () => {
          button.disabled =
            true;

          try {
            await api(
              `/posts/${encodeURIComponent(
                button.dataset.vote
              )}/vote`,
              {
                method: 'POST',

                body: JSON.stringify({
                  option:
                    Number(
                      button.dataset
                        .option
                    )
                })
              }
            );

            await refreshFeed(
              container
            );
          } catch (error) {
            button.disabled =
              false;

            alert(
              error.message
            );
          }
        };
    });

    // =====================
    // POST MORE MENU
    // =====================

    $$(
      '[data-more]',
      container
    ).forEach(button => {
      button.onclick =
        event => {
          event.stopPropagation();

          const postId =
            button.dataset.more;

          const me =
            currentIdentity();

          const posts =
            getRenderedPostData(
              container
            );

          const postData =
            posts.find(
              item =>
                String(item.id) ===
                String(postId)
            );

          const isMine =
            postData?.authorId ===
              me.id ||
            postData?.userId ===
              me.id ||
            postData?.ownerId ===
              me.id;

          const actions = [];

          if (isMine) {
            actions.push({
              label: 'Edit',
              action: () =>
                editPost(
                  postId,
                  container
                )
            });

            actions.push({
              label: 'Delete',
              action: () =>
                deletePost(
                  postId,
                  container
                )
            });
          } else {
            actions.push({
              label: 'Hide',
              action: async () => {
                await api(
                  `/posts/${encodeURIComponent(
                    postId
                  )}/hide`,
                  {
                    method: 'POST'
                  }
                );

                hideLocalPost(
                  postId
                );

                await refreshFeed(
                  container
                );
              }
            });
          }

          actions.push({
            label: 'Report',
            action: () =>
              new Promise(
                resolve => {
                  showReportMenu({
                    title:
                      'Report post',

                    submit:
                      async reason => {
                        await api(
                          `/posts/${encodeURIComponent(
                            postId
                          )}/report`,
                          {
                            method: 'POST',

                            body:
                              JSON.stringify({
                                reason
                              })
                          }
                        );

                        resolve();
                      }
                  });
                }
              )
          });

          createActionMenu(
            button,
            actions
          );
        };
    });

    // =====================
    // COMMENT MORE MENU
    // =====================

    $$(
      '[data-comment-more]',
      container
    ).forEach(button => {
      button.onclick =
        event => {
          event.stopPropagation();

          const postId =
            button.dataset
              .commentMore;

          const commentId =
            button.dataset
              .commentId;

          const comments =
            getRenderedComments(
              container,
              postId
            );

          const comment =
            comments.find(
              item =>
                String(item.id) ===
                String(commentId)
            );

          const me =
            currentIdentity();

          const isMine =
            comment?.userId ===
              me.id ||
            comment?.authorId ===
              me.id ||
            comment?.ownerId ===
              me.id;

          const actions = [];

          if (isMine) {
            actions.push({
              label: 'Edit',
              action: () =>
                editComment(
                  postId,
                  commentId,
                  container
                )
            });

            actions.push({
              label: 'Delete',
              action: () =>
                deleteComment(
                  postId,
                  commentId,
                  container
                )
            });
          }

          actions.push({
            label: 'Report',
            action: () =>
              new Promise(
                resolve => {
                  showReportMenu({
                    title:
                      'Report comment',

                    submit:
                      async reason => {
                        await api(
                          `/posts/${encodeURIComponent(
                            postId
                          )}/comments/${encodeURIComponent(
                            commentId
                          )}/report`,
                          {
                            method: 'POST',

                            body:
                              JSON.stringify({
                                reason
                              })
                          }
                        );

                        resolve();
                      }
                  );
                }
              )
          });

          createActionMenu(
            button,
            actions
          );
        };
    });
  }

  // =========================
  // RENDERED DATA HELPERS
  // =========================

  function getRenderedPostData(
    container
  ) {
    return Array.isArray(
      container._ddpPosts
    )
      ? container._ddpPosts
      : [];
  }

  function getRenderedComments(
    container,
    postId
  ) {
    const posts =
      getRenderedPostData(
        container
      );

    const post =
      posts.find(
        item =>
          String(item.id) ===
          String(postId)
      );

    return Array.isArray(
      post?.comments
    )
      ? post.comments
      : [];
  }

  // =========================
  // CREATE POST
  // =========================

  function initCreatePost() {
    const form =
      $('#createPostForm');

    if (!form) return;

    const input =
      $('#postImage');

    const preview =
      $('#imagePreview');

    input?.addEventListener(
      'change',
      () => {
        const file =
          input.files?.[0];

        if (!file) {
          if (preview) {
            preview.innerHTML =
              '';
          }

          return;
        }

        if (
          !file.type.startsWith(
            'image/'
          )
        ) {
          input.value = '';

          alert(
            'Please choose an image.'
          );

          return;
        }

        if (
          file.size >
          2 * 1024 * 1024
        ) {
          input.value = '';

          alert(
            'Please keep the image under 2 MB.'
          );

          return;
        }

        const reader =
          new FileReader();

        reader.onload =
          () => {
            if (preview) {
              preview.innerHTML =
                `
                  <img
                    src="${escapeHTML(
                      reader.result
                    )}"
                    alt="Preview"
                  >
                `;
            }
          };

        reader.readAsDataURL(
          file
        );
      }
    );

    form.onsubmit =
      async event => {
        event.preventDefault();

        const formData =
          new FormData(form);

        let image = '';

        const file =
          input?.files?.[0];

        if (file) {
          image =
            await new Promise(
              (resolve, reject) => {
                const reader =
                  new FileReader();

                reader.onload =
                  () =>
                    resolve(
                      reader.result
                    );

                reader.onerror =
                  () =>
                    reject(
                      new Error(
                        'Unable to read image.'
                      )
                    );

                reader.readAsDataURL(
                  file
                );
              }
            );
        }

        const payload = {
          type: 'post',

          topic:
            maskSwearing(
              String(
                formData.get(
                  'topic'
                ) || ''
              ).trim()
            ),

          content:
            maskSwearing(
              String(
                formData.get(
                  'content'
                ) || ''
              ).trim()
            ),

          image
        };

        if (
          !payload.topic &&
          !payload.content &&
          !payload.image
        ) {
          alert(
            'Add something to your post first.'
          );

          return;
        }

        const submit =
          $(
            'button[type=submit]',
            form
          );

        if (submit) {
          submit.disabled =
            true;
        }

        try {
          await api(
            '/posts',
            {
              method: 'POST',

              body:
                JSON.stringify(
                  payload
                )
            }
          );

          location.href =
            '/frontend/pages/home.html';
        } catch (error) {
          if (submit) {
            submit.disabled =
              false;
          }

          alert(
            error.message
          );
        }
      };
  }

  // =========================
  // CREATE POLL
  // =========================

  function initPoll() {
    const form =
      $('#createPollForm');

    if (!form) return;

    const list =
      $('#pollOptions');

    const add =
      $('#addOption');

    const update =
      () => {
        const count =
          $$('.pollEditRow', list)
            .length;

        if (add) {
          add.disabled =
            count >= 4;
        }

        $$('.removeOption', list)
          .forEach(button => {
            button.disabled =
              count <= 2;
          });
      };

    add?.addEventListener(
      'click',
      () => {
        const count =
          $$('.pollEditRow', list)
            .length;

        if (count >= 4) return;

        const row =
          document.createElement(
            'div'
          );

        row.className =
          'pollEditRow';

        row.innerHTML = `
          <input
            name="option"
            maxlength="100"
            placeholder="Option ${
              count + 1
            }"
            required
          >

          <button
            type="button"
            class="removeOption"
          >
            ×
          </button>
        `;

        list.appendChild(
          row
        );

        update();
      }
    );

    list?.addEventListener(
      'click',
      event => {
        if (
          event.target.classList.contains(
            'removeOption'
          )
        ) {
          event.target
            .closest(
              '.pollEditRow'
            )
            ?.remove();

          update();
        }
      }
    );

    form.onsubmit =
      async event => {
        event.preventDefault();

        const options =
          $$(
            'input[name=option]',
            form
          )
            .map(
              input =>
                maskSwearing(
                  input.value.trim()
                )
            )
            .filter(Boolean);

        const topic =
          $(
            '#pollQuestion'
          )?.value.trim() ||
          '';

        if (
          !topic ||
          options.length < 2 ||
          options.length > 4
        ) {
          alert(
            'Use a question and 2–4 options.'
          );

          return;
        }

        if (
          new Set(
            options.map(
              option =>
                option.toLowerCase()
            )
          ).size !==
          options.length
        ) {
          alert(
            'Poll options must be different.'
          );

          return;
        }

        const submit =
          $(
            'button[type=submit]',
            form
          );

        if (submit) {
          submit.disabled =
            true;
        }

        try {
          await api(
            '/posts',
            {
              method: 'POST',

              body:
                JSON.stringify({
                  type: 'poll',

                  topic:
                    maskSwearing(
                      topic
                    ),

                  options
                })
            }
          );

          location.href =
            '/frontend/pages/home.html';
        } catch (error) {
          if (submit) {
            submit.disabled =
              false;
          }

          alert(
            error.message
          );
        }
      };

    update();
  }

  // =========================
  // SETTINGS
  // =========================

  function initSettings() {
    applyAppearance();

    const selected =
      localStorage.getItem(
        KEYS.appearance
      ) || 'system';

    $$('[data-appearance]')
      .forEach(input => {
        input.checked =
          input.dataset
            .appearance ===
          selected;

        input.onchange =
          () =>
            setAppearance(
              input.dataset
                .appearance
            );
      });

    $('#logoutBtn')
      ?.addEventListener(
        'click',
        () => {
          localStorage.removeItem(
            KEYS.identity
          );

          location.href =
            '/';
        }
      );
  }

  // =========================
  // SEARCH
  // =========================

  async function initSearch() {
    const input =
      $('#searchInput');

    const button =
      $('#searchBtn');

    const output =
      $('#searches');

    if (!input || !output) {
      return;
    }

    const run =
      async () => {
        const query =
          input.value.trim();

        output.dataset.filter =
          'all';

        output.dataset.query =
          query;

        output.innerHTML =
          '<div class="emptyState">Searching…</div>';

        try {
          const posts =
            await loadPosts(
              query
            );

          output._ddpPosts =
            posts;

          output.innerHTML =
            posts.length
              ? posts
                  .map(postCard)
                  .join('')
              : `
                  <div class="emptyState">
                    No results found.
                  </div>
                `;

          bindFeed(
            output
          );
        } catch (error) {
          renderError(
            output,
            error
          );
        }
      };

    button?.addEventListener(
      'click',
      run
    );

    input.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Enter'
        ) {
          run();
        }
      }
    );

    const initial =
      new URLSearchParams(
        location.search
      ).get('q');

    if (initial) {
      input.value =
        initial;

      run();
    }
  }

  // =========================
  // NOTIFICATIONS
  // =========================

  async function initNotifications() {
    const output =
      $('#mainNotif');

    if (!output) return;

    try {
      const response =
        await api(
          '/notifications'
        );

      const notifications =
        Array.isArray(
          response.notifications
        )
          ? response.notifications
          : [];

      output.innerHTML =
        notifications.length
          ? notifications
              .map(
                notification => `
                  <article
                    class="notification ${
                      notification.read
                        ? ''
                        : 'unread'
                    }"
                  >

                    <b>
                      ${safeText(
                        notification.actorName ||
                        'Anonymous'
                      )}
                    </b>

                    ${safeText(
                      notification.message
                    )}

                    <small>
                      ${formatDate(
                        notification.createdAt
                      )}
                    </small>

                  </article>
                `
              )
              .join('')
          : `
              <div class="emptyState">
                You are all caught up.
              </div>
            `;

      await api(
        '/notifications/read',
        {
          method: 'POST'
        }
      );
    } catch (error) {
      output.innerHTML = `
        <div class="emptyState">
          ${escapeHTML(
            error.message
          )}
        </div>
      `;
    }
  }

  // =========================
  // HOME
  // =========================

  function initHome() {
    const feed =
      $('#mgaPosts');

    if (feed) {
      const filter =
        feed.dataset.filter ||
        'all';

      renderFeed(
        feed,
        filter
      );
    }

    const nav =
      $('#nav');

    if (nav) {
      nav.innerHTML =
        makeNav(
          document.body.dataset
            .nav || 'home'
        );
    }
  }

  // =========================
  // PUBLIC API
  // =========================

  window.DDP = {
    api,

    currentIdentity,

    renderFeed,

    applyAppearance,

    setAppearance,

    makeNav,

    loadPosts,

    hideLocalPost,

    isLocallyHidden,

    maskSwearing
  };

  // =========================
  // START
  // =========================

  const boot =
    () => {
      applyAppearance();

      initCreatePost();

      initPoll();

      initSettings();

      initSearch();

      initNotifications();

      initHome();
    };

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      {
        once: true
      }
    );
  } else {
    boot();
  }
})();