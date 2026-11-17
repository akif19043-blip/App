-- Bozkır Harekâtı — istemci girişi.
-- Ekranları kurar, sunucu olaylarını dinler ve her karede silah, hareket ve
-- HUD'u günceller. Üç görünüm var: "menu" (teçhizat), "playing" (sahada),
-- "dead" (ölüm kamerası).

local GuiService = game:GetService("GuiService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Util = require(Shared.Util)

local Arsenal = require(script.Parent.Arsenal)
local Controls = require(script.Parent.Controls)
local Effects = require(script.Parent.Effects)
local Hud = require(script.Parent.Hud)
local Menu = require(script.Parent.Menu)
local Movement = require(script.Parent.Movement)
local Scoreboard = require(script.Parent.Scoreboard)
local Sfx = require(script.Parent.Sfx)
local Ui = require(script.Parent.Ui)

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local State = ReplicatedStorage:WaitForChild("State")
local camera = workspace.CurrentCamera

local view = "menu"
local alive = false
local character
local humanoid
local respawnAt = 0
local deathAt = 0
local deathInfo
local deathText = ""
local deathPosition
local lastDeploy = 0
local lastLook = 0
local radarCache = { origin = Vector3.zero, blips = {} }
local lastRadar = 0

-- Roblox'un kendi can çubuğu, çantası ve oyuncu listesi kapatılır
task.spawn(function()
	for _ = 1, 30 do
		local ok = pcall(function()
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)
			StarterGui:SetCore("ResetButtonCallback", false)
		end)
		if ok then
			break
		end
		task.wait(0.5)
	end
end)

local function phase()
	return State:GetAttribute("Phase") or "Intermission"
end

local function canDeploy(now)
	return phase() == "Playing" and not alive and now >= respawnAt and now - lastDeploy > 1.5
end

-- Menüde ve ölüm ekranında arka plan bulanıklaşır (yalnızca bu oyuncuda)
local blur = Instance.new("BlurEffect")
blur.Name = "MenuBlur"
blur.Size = 0
blur.Parent = Lighting

local function setView(newView)
	view = newView
	blur.Size = newView == "menu" and 14 or (newView == "dead" and 5 or 0)
	Hud.setVisible(newView == "playing")
	Controls.setTouchVisible(newView == "playing")
	Menu.setView(newView == "playing" and "hidden" or (newView == "dead" and "death" or "menu"))
	UserInputService.MouseIconEnabled = newView ~= "playing"
	if newView ~= "playing" then
		camera.CameraType = Enum.CameraType.Scriptable
		Scoreboard.setVisible(false)
	end
end

local function deploy()
	local now = os.clock()
	if canDeploy(now) then
		lastDeploy = now
		Sfx.play2D("click")
		remotes.Deploy:FireServer()
	end
end

local function leaveField()
	alive = false
	Arsenal.clear()
	Movement.clear()
	character = nil
	humanoid = nil
end

-- Sunucu olayları ------------------------------------------------------------

remotes.Spawned.OnClientEvent:Connect(function(payload)
	local newCharacter = player.Character or player.CharacterAdded:Wait()
	local newHumanoid = newCharacter:WaitForChild("Humanoid", 5)
	if not newHumanoid then
		return
	end
	local fresh = newCharacter ~= character or not alive
	character = newCharacter
	humanoid = newHumanoid
	Arsenal.setup(payload, newCharacter)
	if fresh then
		alive = true
		Movement.setup(newHumanoid)
		camera.CameraType = Enum.CameraType.Custom
		camera.CameraSubject = newHumanoid
		setView("playing")
	end
end)

remotes.Died.OnClientEvent:Connect(function(info)
	deathPosition = camera.CFrame.Position
	leaveField()
	deathInfo = info
	deathAt = os.clock()
	respawnAt = deathAt + (info.respawn or Config.RespawnDelay)
	if info.killer then
		deathText = string.format(
			"<b>%s</b> seni %s ile vurdu%s",
			info.killer,
			info.weapon or "?",
			info.headshot and ' · <font color="#DEB85C">kafadan</font>' or ""
		)
	else
		deathText = info.weapon and (info.weapon .. " yüzünden") or "Kaza"
	end
	Menu.setDeath(deathText, "")
	Sfx.play2D("hurt")
	setView("dead")
end)

remotes.HitConfirm.OnClientEvent:Connect(function(info)
	Hud.hitmarker(info)
	Sfx.play2D(info.killed and "kill" or (info.headshot and "headshot" or "hit"))
end)

remotes.Damaged.OnClientEvent:Connect(function(from)
	Hud.damageFrom(from)
	Sfx.play2D("hurt", 0.2)
end)

remotes.KillFeed.OnClientEvent:Connect(function(entry)
	Hud.killfeed(entry)
end)

remotes.Profile.OnClientEvent:Connect(function(profile)
	Menu.setProfile(profile)
end)

remotes.Notify.OnClientEvent:Connect(function(data)
	if type(data) ~= "table" then
		return
	end
	if data.kind == "xp" then
		Hud.popup(data.amount, data.text)
	elseif data.kind == "rank" then
		local unlocked = data.unlocked and #data.unlocked > 0 and ("Açılan: " .. table.concat(data.unlocked, ", "))
			or "Yeni eklentiler için silahlarınla leş almaya devam et."
		Hud.banner(string.format("RÜTBE ATLADIN · %s", string.upper(data.name or "")), unlocked, 4)
		Sfx.play2D("rankup")
	elseif data.kind == "capture" then
		Hud.announce(data.text, Ui.teamColor(data.team))
		Sfx.play2D("capture")
	elseif data.kind == "tier" then
		Hud.announce(string.format("Seviye %d/%d · %s", data.tier, data.total, data.weapon), Ui.Colors.accent)
	elseif data.kind == "round" then
		Hud.banner(string.upper(data.title or ""), data.text, 4)
	elseif data.kind == "announce" then
		Hud.announce(data.text, data.team and Ui.teamColor(data.team) or nil)
	end
end)

-- Kurulum ----------------------------------------------------------------

Effects.init(remotes)
Arsenal.init(remotes)
Hud.build(playerGui, camera)
Scoreboard.build(playerGui, camera)
Controls.buildTouch(playerGui, camera)
Menu.build(playerGui, camera, {
	deploy = deploy,
	setLoadout = function(loadout)
		remotes.SetLoadout:FireServer(loadout)
	end,
})

local function applyTopInset()
	local ok, inset = pcall(function()
		return GuiService.TopbarInset.Height
	end)
	Hud.setTopInset(ok and inset or 58)
end
Controls.init({
	fire = function(down)
		if view == "playing" then
			Arsenal.setFire(down)
		elseif not down then
			Arsenal.setFire(false)
		end
	end,
	aim = function(down)
		Arsenal.setAim(down and view == "playing")
	end,
	toggleAim = Arsenal.toggleAim,
	reload = Arsenal.reload,
	equip = Arsenal.equip,
	cycle = Arsenal.cycle,
	swapLast = Arsenal.swapLast,
	grenade = Arsenal.grenade,
	melee = Arsenal.melee,
	sprint = Movement.setSprint,
	toggleSprint = Movement.toggleSprint,
	crouch = Movement.toggleCrouch,
	scoreboard = function(down)
		Scoreboard.setVisible(down)
	end,
	toggleScoreboard = function()
		Scoreboard.setVisible(not Scoreboard.isVisible())
	end,
	deploy = function()
		if view == "menu" then
			deploy()
		end
	end,
	inputModeChanged = function(touch)
		Hud.setTouchLayout(touch)
		applyTopInset()
		Controls.setTouchVisible(view == "playing")
	end,
})
Hud.setTouchLayout(Controls.isTouch())
applyTopInset()
pcall(function()
	GuiService:GetPropertyChangedSignal("TopbarInset"):Connect(applyTopInset)
end)
camera:GetPropertyChangedSignal("ViewportSize"):Connect(applyTopInset)
setView("menu")
remotes.Profile:FireServer()

-- Her kare ----------------------------------------------------------------

local FIRE_MODE = Menu.FireModeText

local function pointInfo(root)
	local folder = workspace:FindFirstChild("Points")
	if not folder then
		return nil
	end
	local result = {}
	local any = false
	for _, model in ipairs(folder:GetChildren()) do
		local letter = model:GetAttribute("Letter")
		local zone = model.PrimaryPart
		if letter and zone then
			any = true
			local inside = root ~= nil and Util.flat(root.Position - zone.Position).Magnitude <= Config.CaptureRadius
			result[letter] = {
				owner = model:GetAttribute("Owner") or "",
				progress = model:GetAttribute("Progress") or 0,
				capTeam = model:GetAttribute("CapTeam") or "",
				contested = model:GetAttribute("Contested") == true,
				inside = inside,
				position = zone.Position,
			}
		end
	end
	return any and result or nil
end

local function enemy(teamId, ffa)
	return ffa or teamId ~= player:GetAttribute("TeamId")
end

-- Radar ve takım arkadaşı etiketleri saniyede on kez yenilenir
local function updateRadar(root, points, ffa)
	local blips = {}
	local now = os.clock()
	for _, model in ipairs(workspace:GetChildren()) do
		if model ~= character and model:IsA("Model") then
			local teamId = model:GetAttribute("Team")
			local theirRoot = teamId and model:FindFirstChild("HumanoidRootPart")
			local theirHumanoid = theirRoot and model:FindFirstChildOfClass("Humanoid")
			if theirHumanoid and theirHumanoid.Health > 0 then
				if not enemy(teamId, ffa) then
					table.insert(blips, { position = theirRoot.Position, color = Ui.teamColor(teamId) })
				else
					local heard = Effects.heardAt[model]
					if heard and now - heard < 2.5 then
						table.insert(
							blips,
							{ position = theirRoot.Position, color = Ui.Colors.bad, fade = (now - heard) / 2.5 * 0.7 }
						)
					end
				end
				-- Takım arkadaşının başının üstünde adı
				local head = model:FindFirstChild("Head")
				local tag = head and head:FindFirstChild("TeamTag")
				local wantTag = head ~= nil and not enemy(teamId, ffa)
				if wantTag and not tag then
					tag = Ui.make("BillboardGui", {
						Name = "TeamTag",
						Size = UDim2.fromOffset(140, 22),
						StudsOffset = Vector3.new(0, 2.6, 0),
						AlwaysOnTop = true,
						MaxDistance = 220,
						LightInfluence = 0,
						Parent = head,
					}, {
						Ui.label({
							Size = UDim2.fromScale(1, 1),
							TextXAlignment = Enum.TextXAlignment.Center,
							TextSize = 14,
							Text = model:GetAttribute("EntityName") or model.Name,
							TextColor3 = Ui.teamColor(teamId),
						}, { Ui.textStroke(0.3) }),
					})
				elseif tag and not wantTag then
					tag:Destroy()
				end
			end
		end
	end
	if points then
		for letter, info in pairs(points) do
			table.insert(blips, {
				position = info.position,
				color = info.owner ~= "" and Ui.teamColor(info.owner) or Ui.Colors.text,
				big = true,
				letter = letter,
			})
		end
	end
	radarCache = { origin = root and root.Position or Vector3.zero, blips = blips }
end

local function hudData(dt)
	local now = os.clock()
	local ffa = State:GetAttribute("FFA") == true
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local points = pointInfo(root)
	if now - lastRadar > 0.1 then
		lastRadar = now
		updateRadar(root, points, ffa)
	end

	local weapon = Arsenal.current()
	local weaponData
	local prompt
	if weapon then
		local stats = weapon.stats
		weaponData = {
			name = stats.name,
			melee = stats.melee == true,
			mag = weapon.mag,
			magSize = stats.magSize,
			reserve = weapon.reserve,
			mode = stats.melee and "Yakın dövüş" or (FIRE_MODE[stats.fireMode] or ""),
		}
		if not stats.melee and not Arsenal.reloadStart then
			if weapon.mag == 0 and weapon.reserve == 0 then
				prompt = "Cephane bitti · silah değiştir"
			elseif weapon.mag <= math.floor(stats.magSize * 0.25) and weapon.reserve > 0 then
				prompt = Controls.isTouch() and "DOLDUR" or "R · Doldur"
			end
		end
	end

	local tier = player:GetAttribute("Tier") or 1
	local modeShort = State:GetAttribute("ModeName") or ""
	local target = State:GetAttribute("Target") or 0
	local leader = State:GetAttribute("LeaderName") or ""
	local ffaLine = string.format("Seviyen %d/%d", tier, target)
	if leader ~= "" then
		ffaLine ..= string.format("   ·   Lider: %s (%d)", leader, State:GetAttribute("LeaderTier") or 1)
	end

	return {
		alive = alive,
		weapon = weaponData,
		aim = Arsenal.aimAlpha,
		scoped = Arsenal.scoped,
		spread = Arsenal.spread(),
		fov = camera.FieldOfView,
		viewportY = camera.ViewportSize.Y,
		health = humanoid and humanoid.Health or 0,
		maxHealth = humanoid and humanoid.MaxHealth or 100,
		grenades = Arsenal.grenades,
		reload = Arsenal.reloadProgress(),
		prompt = prompt,
		cameraCFrame = camera.CFrame,
		teamId = player:GetAttribute("TeamId"),
		timeText = Util.formatTime(State:GetAttribute("TimeLeft") or 0),
		points = points,
		radar = radarCache,
		dt = dt,
		state = {
			modeShort = modeShort,
			ffa = ffa,
			target = target,
			ffaLine = ffaLine,
			scores = {
				Sahin = State:GetAttribute("ScoreSahin") or 0,
				Ejder = State:GetAttribute("ScoreEjder") or 0,
			},
			teamNames = {
				Sahin = Config.TeamById.Sahin.short,
				Ejder = Config.TeamById.Ejder.short,
			},
		},
	}
end

local function topPlayers()
	local board = State:FindFirstChild("Scoreboard")
	if not board then
		return ""
	end
	local rows = board:GetChildren()
	table.sort(rows, function(a, b)
		return (a:GetAttribute("Score") or 0) > (b:GetAttribute("Score") or 0)
	end)
	local parts = {}
	for index = 1, math.min(3, #rows) do
		table.insert(
			parts,
			string.format("%s %d", rows[index]:GetAttribute("Name") or "?", rows[index]:GetAttribute("Score") or 0)
		)
	end
	return #parts > 0 and ("En iyiler: " .. table.concat(parts, "  ·  ")) or ""
end

local function menuData(now)
	local current = phase()
	local timeText = Util.formatTime(State:GetAttribute("TimeLeft") or 0)
	local d = {
		modeName = string.upper(State:GetAttribute("ModeName") or ""),
		gunGame = State:GetAttribute("Mode") == "gg",
		canDeploy = canDeploy(now),
		infoTitle = State:GetAttribute("ModeName") or "",
	}
	local weather = State:GetAttribute("Weather")
	if current == "Intermission" then
		d.phaseText = string.format("Tur başlıyor · %s%s", timeText, weather and ("  ·  Hava: " .. weather) or "")
		d.deployText = "Tur başlayınca katılabilirsin"
	elseif current == "Playing" then
		d.phaseText = string.format("Savaş sürüyor · %s kaldı", timeText)
		if now < respawnAt then
			d.deployText = string.format("Yeniden doğuş: %d", math.ceil(respawnAt - now))
		else
			local team = Config.TeamById[player:GetAttribute("TeamId")]
			d.deployText = State:GetAttribute("FFA") and "Herkes tek başına" or (team and team.name or "")
		end
	else
		d.phaseText = string.format("Tur bitti · sıradaki tur %s", timeText)
		d.deployText = "Sıradaki turu bekle"
		local winnerTeam = State:GetAttribute("Winner") or ""
		local winnerName = State:GetAttribute("WinnerName") or ""
		if winnerName ~= "" then
			d.result = { title = string.upper(winnerName) .. " KAZANDI", text = topPlayers(), color = Ui.Colors.accent }
		elseif winnerTeam ~= "" then
			local team = Config.TeamById[winnerTeam]
			local mine = winnerTeam == player:GetAttribute("TeamId")
			d.result = {
				title = (mine and "ZAFER · " or "YENİLGİ · ") .. string.upper(team.name) .. " KAZANDI",
				text = topPlayers(),
				color = team.color,
			}
		else
			d.result = { title = "BERABERE", text = topPlayers(), color = Ui.Colors.line }
		end
	end
	local tips = Controls.isTouch()
			and "Sol: yürü · Ekranı kaydır: bak\nATEŞ, NİŞAN, DOLDUR, SİLAH, BOMBA, BIÇAK, EĞİL ve KOŞ düğmeleri sağda."
		or "WASD yürü · Fare bak · Sol tık ateş · Sağ tık nişan\nR doldur · 1/2/3 silah · G bomba · V bıçak\nShift koş · C eğil (koşarken: kay) · Tab skor"
	d.infoText = (State:GetAttribute("ModeInfo") or "") .. '\n\n<font color="#A0A294">' .. tips .. "</font>"
	return d
end

local function menuCamera(now)
	local angle = now * 0.04
	local position = Vector3.new(math.sin(angle) * 250, 120, math.cos(angle) * 250)
	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = 60
	camera.CFrame = CFrame.lookAt(position, Vector3.new(0, 0, 0))
end

local function deathCamera(now)
	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = 55
	local killer = deathInfo and deathInfo.killerCharacter
	local head = killer and killer.Parent and killer:FindFirstChild("Head")
	local from = (deathPosition or camera.CFrame.Position) + Vector3.new(0, 3, 0)
	if head then
		local target = CFrame.lookAt(from, head.Position)
		camera.CFrame = camera.CFrame:Lerp(target, Util.smooth(4, 1 / 60))
	else
		camera.CFrame = camera.CFrame * CFrame.Angles(0, 0.002, 0)
	end
	local remaining = math.max(0, respawnAt - now)
	Menu.setDeath(
		deathText,
		remaining > 0 and string.format("Teçhizat ekranı %d sn içinde", math.ceil(remaining)) or ""
	)
	if now - deathAt > math.max(2.5, respawnAt - deathAt) then
		setView("menu")
	end
end

RunService:BindToRenderStep("BozkirArsenal", Enum.RenderPriority.Camera.Value + 1, function(dt)
	local now = os.clock()

	-- Karakter kaybolduysa (tur sonu, sunucu kaldırdı) menüye dön
	if alive and (not character or not character.Parent or not humanoid or humanoid.Health <= 0) then
		if humanoid and humanoid.Health <= 0 then
			deathPosition = camera.CFrame.Position
			deathAt = now
			respawnAt = math.max(respawnAt, now + Config.RespawnDelay)
			deathInfo = { weapon = "Kaza" }
			deathText = "Kaza"
			leaveField()
			setView("dead")
		else
			leaveField()
			setView("menu")
		end
	end
	if view == "playing" and phase() ~= "Playing" then
		-- Tur bitti: sunucu karakterleri kaldıracak, sonucu menüde göster
		leaveField()
		setView("menu")
	end

	if view == "playing" then
		Movement.update(dt, camera)
		Arsenal.update(dt)
		Hud.update(hudData(dt))
		if now - lastLook > 0.12 then
			lastLook = now
			remotes.Look:FireServer(math.asin(math.clamp(camera.CFrame.LookVector.Y, -1, 1)))
		end
	elseif view == "dead" then
		deathCamera(now)
	else
		menuCamera(now)
		Menu.update(menuData(now))
	end

	if Scoreboard.isVisible() and math.floor(now * 4) ~= math.floor((now - dt) * 4) then
		Scoreboard.refresh()
	end
end)
