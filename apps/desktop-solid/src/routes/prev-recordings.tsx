import { createQuery } from "@tanstack/solid-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cx } from "cva";
import {
  type Accessor,
  type ComponentProps,
  For,
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import createPresence from "solid-presence";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import Tooltip from "@corvu/tooltip";
import { Button } from "@cap/ui-solid";
import { createElementBounds } from "@solid-primitives/bounds";
import { save } from "@tauri-apps/plugin-dialog";
import { commands, events } from "../utils/tauri";

export default function () {
  const recordings = createQuery(() => ({
    queryKey: ["recordings"],
    queryFn: async () => {
      const o = await commands.getPrevRecordings();
      if (o.status === "ok") return o.data;
    },
  }));

  events.showCapturesPanel.listen(() => {
    recordings.refetch();
  });

  events.refreshCapturesPanel.listen(() => {
    location.reload();
  });

  const [removedCount, setRemovedCount] = createSignal(0);
  const [hasClosedWindow, setHasClosedWindow] = createSignal(false);
  const [isScrolledToTop, setIsScrolledToTop] = createSignal(true);

  const visibleRecordings = () => recordings.data?.slice().reverse();

  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    setIsScrolledToTop(target.scrollTop === 0);
  };

  return (
    <div class="w-screen h-[100vh] bg-transparent relative">
      <div
        class="w-full relative left-0 bottom-0 flex flex-col-reverse pl-[40px] pb-[80px] gap-4 h-full overflow-y-auto"
        onScroll={handleScroll}
      >
        <div class="pt-12 w-full flex flex-col-reverse gap-4">
          <For each={visibleRecordings()}>
            {(recording, i) => {
              const [ref, setRef] = createSignal<HTMLElement | null>(null);
              const [exiting, setExiting] = createSignal(false);
              const [isCopyLoading, setIsCopyLoading] = createSignal(false);
              const [isCopySuccess, setIsCopySuccess] = createSignal(false);
              const [isSaveLoading, setIsSaveLoading] = createSignal(false);
              const [isSaveSuccess, setIsSaveSuccess] = createSignal(false);
              const [metadata, setMetadata] = createSignal({
                duration: 0,
                size: 0,
              });

              const [imageExists, setImageExists] = createSignal(true);

              const { present } = createPresence({
                show: () => !exiting(),
                element: ref,
              });

              const isLoading = () => isCopyLoading() || isSaveLoading();

              createEffect(() => {
                commands.getVideoMetadata(recording, null).then((result) => {
                  if (result.status === "ok") {
                    const [duration, size] = result.data;
                    console.log(
                      `Metadata for ${recording}: duration=${duration}, size=${size}`
                    );
                    setMetadata({
                      duration,
                      size,
                    });
                  } else {
                    console.error(`Failed to get metadata: ${result.error}`);
                  }
                });
              });

              createFakeWindowBounds(ref, () => recording);

              return (
                <Show when={present()}>
                  <div
                    ref={setRef}
                    style={{
                      "border-color": "rgba(255, 255, 255, 0.2)",
                    }}
                    class={cx(
                      "w-[260px] h-[150px] p-[0.1875rem] bg-gray-500 rounded-[12px] overflow-hidden shadow border-[1px] group transition-all relative",
                      "transition-[transform,opacity] duration-300",
                      exiting()
                        ? "animate-out slide-out-to-left-32 fade-out"
                        : "animate-in fade-in"
                    )}
                  >
                    <div
                      class={cx(
                        "w-full h-full flex relative bg-transparent rounded-[8px] border-[1px] overflow-hidden z-10",
                        "transition-all",
                        isLoading() && "backdrop-blur bg-gray-500/80"
                      )}
                      style={{ "border-color": "rgba(255, 255, 255, 0.2)" }}
                    >
                      <Show
                        when={imageExists()}
                        fallback={
                          <div class="pointer-events-none w-[105%] h-[105%] absolute inset-0 -z-10 bg-gray-400" />
                        }
                      >
                        <img
                          class="pointer-events-none w-[105%] h-[105%] object-cover absolute inset-0 -z-10"
                          alt="screenshot"
                          src={`${convertFileSrc(
                            `${recording}/screenshots/display.jpg`
                          )}?t=${Date.now()}`}
                          onError={() => setImageExists(false)}
                        />
                      </Show>
                      <div
                        class={cx(
                          "w-full h-full absolute inset-0 transition-all",
                          isLoading() || "opacity-0 group-hover:opacity-100",
                          "backdrop-blur bg-gray-500/80 text-white p-2"
                        )}
                      >
                        <TooltipIconButton
                          class="absolute left-3 top-3 z-20"
                          tooltipText="Close"
                          tooltipPlacement="right"
                          onClick={() => {
                            setExiting(true);
                            setRemovedCount(removedCount() + 1);
                            if (
                              removedCount() === visibleRecordings()?.length &&
                              !hasClosedWindow()
                            ) {
                              commands.closePreviousRecordingsWindow();
                              setHasClosedWindow(true);
                            }
                          }}
                          disabled={hasClosedWindow()}
                        >
                          <IconCapCircleX class="size-[1rem]" />
                        </TooltipIconButton>
                        <TooltipIconButton
                          class="absolute left-3 bottom-3 z-20"
                          tooltipText="Edit"
                          tooltipPlacement="right"
                          onClick={() => {
                            new WebviewWindow(
                              `editor-${recording
                                .split("/")
                                .at(-1)
                                ?.split(".")[0]!}`,
                              {
                                width: 1150,
                                height: 800,
                                title: "Cap Editor",
                                url: `/editor?path=${recording}`,
                              }
                            );
                          }}
                        >
                          <IconCapEditor class="size-[1rem]" />
                        </TooltipIconButton>
                        <TooltipIconButton
                          class="absolute right-3 top-3 z-20"
                          tooltipText={
                            isCopyLoading()
                              ? "Copying to Clipboard"
                              : "Copy to Clipboard"
                          }
                          forceOpen={isCopyLoading()}
                          tooltipPlacement="left"
                          onClick={async () => {
                            setIsCopyLoading(true);
                            try {
                              await commands.copyRenderedVideoToClipboard(
                                recording,
                                {
                                  aspectRatio: "classic",
                                  background: {
                                    source: {
                                      type: "color",
                                      value: [0, 0, 0],
                                    },
                                    blur: 0,
                                    padding: 0,
                                    rounding: 0,
                                    inset: 0,
                                  },
                                  camera: {
                                    hide: false,
                                    mirror: false,
                                    position: { x: "left", y: "bottom" },
                                    rounding: 0,
                                    shadow: 0,
                                  },
                                  audio: { mute: false, improve: false },
                                  cursor: {
                                    hideWhenIdle: false,
                                    size: 16,
                                    type: "pointer",
                                  },
                                  hotkeys: { show: false },
                                }
                              );
                              setIsCopySuccess(true);
                              setTimeout(() => setIsCopySuccess(false), 2000);
                            } catch (error) {
                              window.alert("Failed to copy to clipboard");
                            } finally {
                              setIsCopyLoading(false);
                            }
                          }}
                          disabled={isSaveLoading()}
                        >
                          <Show when={isCopyLoading()}>
                            <IconLucideLoaderCircle class="size-[1rem] animate-spin" />
                          </Show>
                          <Show when={isCopySuccess()}>
                            <IconLucideCheck class="size-[1rem]" />
                          </Show>
                          <Show when={!isCopyLoading() && !isCopySuccess()}>
                            <IconCapCopy class="size-[1rem]" />
                          </Show>
                        </TooltipIconButton>
                        <TooltipIconButton
                          class="absolute right-3 bottom-3"
                          tooltipText="Create Shareable Link"
                          tooltipPlacement="left"
                          onClick={async () => {
                            // Implement shareable link functionality here
                          }}
                        >
                          <IconCapUpload class="size-[1rem]" />
                        </TooltipIconButton>
                        <div class="absolute inset-0 flex items-center justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              setIsSaveLoading(true);
                              try {
                                const renderedPath =
                                  await commands.getRenderedVideo(recording, {
                                    aspectRatio: "classic",
                                    background: {
                                      source: {
                                        type: "color",
                                        value: [0, 0, 0],
                                      },
                                      blur: 0,
                                      padding: 0,
                                      rounding: 0,
                                      inset: 0,
                                    },
                                    camera: {
                                      hide: false,
                                      mirror: false,
                                      position: { x: "left", y: "bottom" },
                                      rounding: 0,
                                      shadow: 0,
                                    },
                                    audio: { mute: false, improve: false },
                                    cursor: {
                                      hideWhenIdle: false,
                                      size: 16,
                                      type: "pointer",
                                    },
                                    hotkeys: { show: false },
                                  });

                                if (renderedPath.status === "ok") {
                                  const savePath = await save({
                                    filters: [
                                      {
                                        name: "MP4 Video",
                                        extensions: ["mp4"],
                                      },
                                    ],
                                  });

                                  if (savePath) {
                                    await commands.copyFileToPath(
                                      renderedPath.data,
                                      savePath
                                    );
                                    setIsSaveSuccess(true);
                                    setTimeout(
                                      () => setIsSaveSuccess(false),
                                      2000
                                    );
                                  }
                                }
                              } catch (error) {
                                console.error(
                                  "Failed to save recording:",
                                  error
                                );
                                window.alert("Failed to save recording");
                              } finally {
                                setIsSaveLoading(false);
                              }
                            }}
                            disabled={isCopyLoading()}
                          >
                            {isSaveLoading()
                              ? "Saving..."
                              : isSaveSuccess()
                              ? "Saved!"
                              : "Save"}
                          </Button>
                        </div>
                      </div>
                      <div
                        style={{ color: "white", "font-size": "14px" }}
                        class={cx(
                          "absolute bottom-0 left-0 right-0 font-medium bg-gray-500 bg-opacity-40 backdrop-blur p-2 flex justify-between items-center pointer-events-none transition-all group-hover:opacity-0",
                          isLoading() && "opacity-0"
                        )}
                      >
                        <p class="flex items-center">
                          <IconCapCamera class="w-[20px] h-[20px] mr-1" />
                          {Math.floor(metadata().duration / 60)}:
                          {Math.floor(metadata().duration % 60)
                            .toString()
                            .padStart(2, "0")}
                        </p>
                        <p>{metadata().size.toFixed(2)} MB</p>
                      </div>
                    </div>
                  </div>
                </Show>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}

const IconButton = (props: ComponentProps<"button">) => {
  return (
    <button
      {...props}
      type="button"
      class={cx(
        "p-[0.325rem] bg-gray-100 rounded-full text-neutral-300 text-[12px] shadow-[0px 2px 4px rgba(18, 22, 31, 0.12)]",
        props.class
      )}
    />
  );
};

const TooltipIconButton = (
  props: ComponentProps<"button"> & {
    tooltipText: string;
    tooltipPlacement: string;
    forceOpen?: boolean;
  }
) => {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <Tooltip
      placement={props.tooltipPlacement as "top" | "bottom" | "left" | "right"}
      openDelay={0}
      closeDelay={0}
      open={props.forceOpen || isOpen()}
      onOpenChange={setIsOpen}
      hoverableContent={false}
      floatingOptions={{
        offset: 10,
        flip: true,
        shift: true,
      }}
    >
      <Tooltip.Trigger as={IconButton} {...props}>
        {props.children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          class="p-2 font-medium"
          style={{
            "background-color": "rgba(255, 255, 255, 0.1)",
            color: "white",
            "border-radius": "8px",
            "font-size": "12px",
            "z-index": "1000",
          }}
        >
          {props.tooltipText}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip>
  );
};

function createFakeWindowBounds(
  ref: () => HTMLElement | undefined | null,
  key: Accessor<string>
) {
  const bounds = createElementBounds(ref);

  createEffect(() => {
    commands.setFakeWindowBounds(key(), {
      x: bounds.left ?? 0,
      y: bounds.top ?? 0,
      width: bounds.width ?? 0,
      height: bounds.height ?? 0,
    });
  });

  onCleanup(() => {
    commands.removeFakeWindow(key());
  });
}
