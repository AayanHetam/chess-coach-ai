// The course that owes the most, for a screen that is not the course.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO READS, AND THE SECOND ONLY WHEN THE FIRST FOUND SOMETHING
//
// What is owed lives in this browser's storage and is free to read. The course
// NAMES live in a generated index on the server, and fetching it to render a
// task that usually does not exist would put a network request on every visit
// to /plan for the sake of a sentence most players never see.
//
// So storage decides first. The fetch happens only when something is actually
// due, which is by construction the minority case: a card exists only where a
// decision was missed or shown, so a player whose courses have gone well never
// pays for it at all.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import type { DueCourse } from '@/lib/curriculum/dailyPlan';
import { readCourseProgress } from '@/lib/learn/courseProgress';

interface IndexResponse {
  courses?: Array<{ id: string; name: string }>;
}

/**
 * The course with the most decisions due, or undefined.
 *
 * Undefined means "nothing owed, or we could not find out" — the planner reads
 * it as "not measured", which keeps its generic task rather than claiming a
 * player is clear. A failed fetch degrades the same way: a task about reviews
 * is an enrichment on top of a plan that is already complete.
 */
export function useDueCourse(account: string, now: number): DueCourse | undefined {
  const [due, setDue] = useState<DueCourse | undefined>(undefined);

  useEffect(() => {
    if (!account) {
      setDue(undefined);
      return;
    }
    const progress = readCourseProgress(account, now);
    let worst: { courseId: string; due: number } | null = null;
    progress.forEach((value, courseId) => {
      if (value.due > 0 && (!worst || value.due > worst.due)) {
        worst = { courseId, due: value.due };
      }
    });
    if (!worst) {
      setDue(undefined);
      return;
    }
    // TypeScript loses the narrowing through the forEach closure.
    const owed = worst as { courseId: string; due: number };

    let live = true;
    fetch('/api/opening-courses')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: IndexResponse) => {
        if (!live) return;
        const name = data.courses?.find(c => c.id === owed.courseId)?.name;
        // No name, no task. "4 to review in the w-london" is worse than
        // saying nothing, and the id is not a thing a player has ever seen.
        setDue(name ? { courseId: owed.courseId, name, due: owed.due } : undefined);
      })
      .catch(() => live && setDue(undefined));
    return () => {
      live = false;
    };
    // `now` intentionally excluded: it changes on every render of the caller,
    // and re-reading the whole keyspace at 60fps to move a card from
    // "tomorrow" to "today" is not a thing anyone is waiting for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  return due;
}
