package com.gielinorcompanion.exporter;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.io.Reader;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.util.Filepath;

/**
 * Lets a local tool show a route on the map: it drops {@code requests/route.json} into the plugin
 * folder, and this class hands the destination to the Shortest Path plugin through RuneLite's
 * plugin-message API. It can only set or clear Shortest Path's target: the player still walks
 * there themselves, and nothing is sent to the game.
 */
@Slf4j
@Singleton
class RouteRequests
{
	private static final String SHORTEST_PATH = "shortestpath";
	private static final String REQUEST_FILE = "route.json";
	private static final String STATUS_FILE = "route-status.json";
	/** Requests older than this were meant for an earlier session; ignore them. */
	private static final long MAX_AGE_MS = 120_000;
	/** OSRS world coordinates fit comfortably inside these bounds. */
	private static final int MAX_COORD = 16_384;

	@Inject
	private ScheduledExecutorService executor;

	@Inject
	private ClientThread clientThread;

	@Inject
	private EventBus eventBus;

	@Inject
	private Gson gson;

	private Filepath dir;
	private ScheduledFuture<?> poll;
	private long lastHandledId = -1;

	void start(Filepath pluginDir)
	{
		dir = pluginDir.joinSegment("requests");
		poll = executor.scheduleWithFixedDelay(this::check, 1, 1, TimeUnit.SECONDS);
	}

	void stop()
	{
		if (poll != null)
		{
			poll.cancel(false);
			poll = null;
		}
	}

	/** Runs on the shared executor: never on the client thread. */
	private void check()
	{
		try
		{
			Filepath file = dir.joinSegment(REQUEST_FILE);
			if (!file.exists())
			{
				return;
			}
			JsonObject req;
			try (Reader reader = file.openReader())
			{
				req = gson.fromJson(reader, JsonObject.class);
			}
			if (req == null || !req.has("id") || req.get("id").getAsLong() == lastHandledId)
			{
				return;
			}
			long id = req.get("id").getAsLong();
			lastHandledId = id;
			if (System.currentTimeMillis() - id > MAX_AGE_MS)
			{
				return;
			}

			String action = req.has("action") ? req.get("action").getAsString() : "";
			if ("clear".equals(action))
			{
				clientThread.invokeLater(() -> eventBus.post(new PluginMessage(SHORTEST_PATH, "clear")));
				writeStatus(id, "cleared", null);
				return;
			}
			if (!"path".equals(action) || !req.has("target"))
			{
				writeStatus(id, "rejected", "unknown action");
				return;
			}
			JsonObject t = req.getAsJsonObject("target");
			int x = t.get("x").getAsInt();
			int y = t.get("y").getAsInt();
			int plane = t.has("plane") ? t.get("plane").getAsInt() : 0;
			if (x <= 0 || y <= 0 || x >= MAX_COORD || y >= MAX_COORD || plane < 0 || plane > 3)
			{
				writeStatus(id, "rejected", "coordinates out of range");
				return;
			}
			WorldPoint target = new WorldPoint(x, y, plane);
			Map<String, Object> data = new LinkedHashMap<>();
			data.put("target", target);
			clientThread.invokeLater(() -> eventBus.post(new PluginMessage(SHORTEST_PATH, "path", data)));
			writeStatus(id, "sent", target.toString());
			log.debug("Route request {} -> {}", id, target);
		}
		catch (IOException | RuntimeException e)
		{
			log.debug("Ignoring unreadable route request", e);
		}
	}

	private void writeStatus(long id, String status, String detail) throws IOException
	{
		JsonObject o = new JsonObject();
		o.addProperty("id", id);
		o.addProperty("status", status);
		if (detail != null)
		{
			o.addProperty("detail", detail);
		}
		o.addProperty("at", Instant.now().toString());
		Filepath target = dir.joinSegment(STATUS_FILE);
		Filepath tmp = dir.createTempFile(STATUS_FILE + "-", ".tmp");
		tmp.write(gson.toJson(o));
		try
		{
			tmp.moveTo(target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		}
		catch (IOException e)
		{
			tmp.deleteIfExists();
			target.write(gson.toJson(o));
		}
	}
}
