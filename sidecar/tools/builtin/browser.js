      const u = validate(url);
      if (!local) await assertResolvedSafe(u, doLookup);   // refuse names that RESOLVE private (rebinding)
      const wantedMode = local ? false : ('visible' in opts ? !!opts.visible : undefined);
      const d = wantedMode === undefined ? ensureDriver() : await ensureDriverMode(wantedMode);
      if (local && typeof d.allowLocal === 'function') d.allowLocal(u.href);
      const navigatedUrl = await d.navigate(u.href);
      // Chromium's Page.navigate acknowledgement can report the pre-navigation/placeholder URL
      // (notably about:blank or a chrome-error document) even after the requested document has
      // committed. Validate the URL actually owned by the active page before applying the redirect
      // boundary. This avoids rejecting a valid local test solely from a stale CDP return value.
      let finalUrl = navigatedUrl;
      try {
        const observedUrl = await evalJS('location.href');
        if (observedUrl) finalUrl = observedUrl;
      } catch (_) {}
      if (finalUrl) {
        try {
          validate(finalUrl);
          // the post-redirect host must clear the SAME resolution bar as the one we asked for
          if (!local) await assertResolvedSafe(new URL(finalUrl), doLookup);
        } catch (e) {
          try { await d.navigate('about:blank'); } catch (_) {}
          throw new Error('blocked unsafe redirect: ' + e.message);
        }
      }
      if (local && new URL(finalUrl || u.href).origin !== u.origin) {
        try { await d.navigate('about:blank'); } catch (_) {}
        throw new Error('blocked local redirect outside the owned server origin');
      }
      localMode = local;