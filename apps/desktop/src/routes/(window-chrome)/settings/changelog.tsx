import { For, Show, createResource, ErrorBoundary } from "solid-js";
import { clientEnv } from "~/utils/env";
import { SolidMarkdown } from "solid-markdown";

interface ChangelogEntry {
  title: string;
  app: string;
  version: string;
  publishedAt: string;
  content: string;
}

export default function Page() {
  const [changelog] = createResource<Array<ChangelogEntry>>(async () => {
    const response = await fetch(
      `${clientEnv.VITE_SERVER_URL}/api/changelog?origin=${window.location.origin}`
    );
    if (!response.ok) throw new Error("Failed to fetch changelog");

    return await response.json();
  });

  return (
    <div class="h-full flex flex-col">
      <div class="flex-1 overflow-y-auto">
        <div class="flex flex-col p-6 gap-6 text-sm font-normal">
          <ErrorBoundary
            fallback={(e) => (
              <div class="text-red-500 font-medium">{e.toString()}</div>
            )}
          >
            <ul class="space-y-8">
              <For each={changelog()}>
                {(entry, i) => (
                  <li class="border-b-2 border-gray-200 pb-8 last:border-b-0">
                    <div class="flex mb-2">
                      <Show when={i() === 0}>
                        <div class="bg-blue-400 text-white px-2 py-1 rounded-md uppercase font-bold">
                          <span style="color: #fff" class="text-xs">
                            New
                          </span>
                        </div>
                      </Show>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">
                      {entry.title}
                    </h3>
                    <div class="text-gray-500 text-sm mb-4">
                      Version {entry.version} -{" "}
                      {new Date(entry.publishedAt).toLocaleDateString()}
                    </div>
                    <SolidMarkdown class="prose prose-sm max-w-none">
                      {entry.content}
                    </SolidMarkdown>
                  </li>
                )}
              </For>
            </ul>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
