-- İstemci duman testi: istemcinin asıl kodunu çalıştırır ve sunucudan
-- gelecek mesajları taklit eder. Menü, teçhizat, sahaya iniş, ateş, nişan,
-- dolum, silah değiştirme, bıçak, el bombası, HUD, skor tablosu, ölüm ekranı
-- ve dokunmatik düzen sınanır.

local process = require("@lune/process")
local task = require("@lune/task")

local Harness = require("./harness")

local check = Harness.check
local game = Harness.load(process.args[1])
local roblox = Harness.roblox
local Enum = roblox.Enum
local Vector3 = roblox.Vector3
local CFrame = roblox.CFrame

local workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local Remotes = ReplicatedStorage:FindFirstChild("Remotes")
local State = ReplicatedStorage:FindFirstChild("State")

-- Sunucunun hazırladığı durum
local player = Harness.addPlayer("Deneme", 1001)
Players.LocalPlayer = player
roblox.Instance.new("PlayerGui").Parent = player
player:SetAttribute("TeamId", "Sahin")
UserInputService.TouchEnabled = false
UserInputService.KeyboardEnabled = true
UserInputService.MouseIconEnabled = true
UserInputService.MouseDeltaSensitivity = 1

State:SetAttribute("Phase", "Playing")
State:SetAttribute("Mode", "tdm")
State:SetAttribute("ModeName", "Takım Ölüm Maçı")
State:SetAttribute("ModeInfo", "Hedef leş sayısına ilk ulaşan takım kazanır.")
State:SetAttribute("Target", 50)
State:SetAttribute("FFA", false)
State:SetAttribute("TimeLeft", 300)
State:SetAttribute("ScoreSahin", 3)
State:SetAttribute("ScoreEjder", 5)
local board = roblox.Instance.new("Folder")
board.Name = "Scoreboard"
board.Parent = State
for index, name in ipairs({ "Deneme", "Demir", "Kaya" }) do
	local row = roblox.Instance.new("Configuration")
	row.Name = tostring(index)
	row:SetAttribute("Name", name)
	row:SetAttribute("Team", index == 3 and "Ejder" or "Sahin")
	row:SetAttribute("Kills", index)
	row:SetAttribute("Deaths", 1)
	row:SetAttribute("Assists", 0)
	row:SetAttribute("Score", index * 100)
	row:SetAttribute("Tier", 1)
	row:SetAttribute("Alive", true)
	row:SetAttribute("Bot", index > 1)
	row:SetAttribute("UserId", index == 1 and 1001 or 0)
	row.Parent = board
end

local function serverSends(name, ...)
	Harness.signal(Remotes:FindFirstChild(name), "OnClientEvent"):Fire(...)
	task.wait(0.02)
end

-- Oyun zamanlayıcıları gerçek saati kullanır; her kare gerçekten dt kadar sürer
local function frame(dt)
	dt = dt or 1 / 60
	task.wait(dt)
	Harness.signal(RunService, "RenderStepped"):Fire(dt)
	Harness.signal(RunService, "Heartbeat"):Fire(dt)
	local step = Harness.renderSteps.BozkirArsenal
	if step then
		step.fn(dt)
	end
end

local function frames(count, dt)
	for _ = 1, count do
		frame(dt)
	end
end

local function key(code, down)
	local input = { UserInputType = Enum.UserInputType.Keyboard, KeyCode = code, Position = Vector3.zero }
	Harness.signal(UserInputService, down and "InputBegan" or "InputEnded"):Fire(input, false)
	task.wait(0.01)
end

local function mouse(kind, down)
	-- Gerçekte fare girdisinin KeyCode değeri Unknown; Lune listesinde yok, eşlenmemiş bir tuş kullanılır
	local input = { UserInputType = kind, KeyCode = Enum.KeyCode.F12, Position = Vector3.zero }
	Harness.signal(UserInputService, down and "InputBegan" or "InputEnded"):Fire(input, false)
	task.wait(0.01)
end

local function find(root, predicate)
	for _, item in ipairs(root:GetDescendants()) do
		if predicate(item) then
			return item
		end
	end
	return nil
end

local function click(button)
	Harness.signal(button, "Activated"):Fire()
	task.wait(0.02)
end

local ok, problem = pcall(function()
	print("İstemci başlatılıyor")
	local main = game:GetService("StarterPlayer").StarterPlayerScripts.Client.Main
	Harness.run(main)
	local gui = player.PlayerGui
	Harness.waitFor("menü kurulur", 5, function()
		return gui:FindFirstChild("Menu") ~= nil and Harness.renderSteps.BozkirArsenal ~= nil
	end)
	task.wait(0.1)

	print("\nEkranlar")
	check("HUD kuruldu", gui:FindFirstChild("Hud") ~= nil)
	check("skor tablosu kuruldu", gui:FindFirstChild("Scoreboard") ~= nil)
	check("dokunmatik düğmeler kuruldu", gui:FindFirstChild("TouchControls") ~= nil)
	check("menü açık", gui.Menu.Enabled == true)
	check("HUD kapalı", gui.Hud.Enabled == false)
	check("profil istendi", #Harness.sent("Profile") == 1)

	print("\nMenü")
	frames(5)
	local deploy = find(gui.Menu, function(item)
		return item.Name == "Deploy"
	end)
	check("SAVAŞA KATIL düğmesi etkin", deploy.Text == "SAVAŞA KATIL", deploy.Text)
	serverSends("Profile", {
		xp = 6000,
		rank = 5,
		kills = 40,
		deaths = 20,
		headshots = 9,
		wins = 3,
		matches = 5,
		weaponKills = { bora = 25, dogan = 3 },
		loadout = { primary = "bora", secondary = "akrep", attachments = { bora = { sight = "reddot" } } },
	})
	frames(2)
	local weapons = find(gui.Menu, function(item)
		return item.Name == "Weapons"
	end)
	local dogan = weapons:FindFirstChild("dogan")
	check("keskin nişancı tüfeği listede", dogan ~= nil)
	local firtina = weapons:FindFirstChild("firtina")
	click(firtina)
	task.wait(0.5)
	check("kilitli silah seçilmez (Fırtına rütbe 7)", #Harness.sent("SetLoadout") == 0)
	click(dogan)
	task.wait(0.5)
	local saved = Harness.sent("SetLoadout")
	check("açık silah seçildi ve kaydedildi", #saved == 1 and saved[1][1].primary == "dogan", #saved)
	local detail = find(gui.Menu, function(item)
		return item.Name == "Detail"
	end)
	local suppressor = find(detail, function(item)
		return item:IsA("TextButton") and string.find(item.Text, "Susturucu", 1, true) ~= nil
	end)
	check("eklenti düğmesi var (Susturucu)", suppressor ~= nil)
	Harness.clearOutbox()
	click(suppressor)
	task.wait(0.5)
	check("kilitli eklenti takılmaz (3/15 leş)", #Harness.sent("SetLoadout") == 0)
	click(weapons:FindFirstChild("bora"))
	task.wait(0.5)
	local holo = find(detail, function(item)
		return item:IsA("TextButton") and item.Text == "Holografik"
	end)
	click(holo)
	task.wait(0.5)
	saved = Harness.sent("SetLoadout")
	local last = saved[#saved] and saved[#saved][1]
	check(
		"açık eklenti takıldı (Holografik)",
		last and last.attachments.bora and last.attachments.bora.sight == "holo"
	)

	print("\nSahaya iniş")
	click(deploy)
	check("katılma isteği gönderildi", #Harness.sent("Deploy") == 1)
	local character = Harness.rig("Deneme")
	character:PivotTo(CFrame.new(0, 3, 150))
	character.Parent = workspace
	player.Character = character
	character.Humanoid.MoveDirection = Vector3.new(0, 0, -1)
	serverSends("Spawned", {
		weapons = {
			{ id = "bora", attachments = { sight = "holo", barrel = "suppressor" } },
			{ id = "akrep", attachments = {} },
			{ id = "kama" },
		},
		grenades = 2,
		tier = 1,
	})
	local camera = workspace.CurrentCamera
	-- Gerçek oyunda Roblox'un kamera betiği kamerayı karakterin başına bağlar
	camera.CFrame = CFrame.new(0, 5, 150)
	frames(30)
	check("HUD açıldı", gui.Hud.Enabled == true)
	check("menü kapandı", gui.Menu.Enabled == false)
	local viewmodel = camera:FindFirstChild("Viewmodel")
	check("silah görünümü kamerada", viewmodel ~= nil)
	check("görünümde eller var", viewmodel and viewmodel:FindFirstChild("Sleeve") ~= nil)
	check("susturucu modelde", viewmodel and viewmodel:FindFirstChild("Suppressor") ~= nil)
	local ammo = find(gui.Hud, function(item)
		return item.Name == "AmmoPanel"
	end)
	local weaponName = find(ammo, function(item)
		return item:IsA("TextLabel") and item.Text == "Bora-5"
	end)
	check("HUD silah adını gösteriyor", weaponName ~= nil)

	print("\nAteş")
	Harness.clearOutbox()
	mouse(Enum.UserInputType.MouseButton1, true)
	frames(20, 1 / 30)
	mouse(Enum.UserInputType.MouseButton1, false)
	local shots = Harness.sent("Fire")
	check("otomatik ateş birden çok mermi yolladı", #shots >= 5, #shots)
	local first = shots[1]
	check(
		"atış verisi doğru biçimde",
		first and first[1] == "bora" and typeof(first[2]) == "Vector3" and typeof(first[3][1].dir) == "Vector3"
	)
	check("bakış sunucuya bildirildi", #Harness.sent("Look") > 0)

	print("\nNişan")
	mouse(Enum.UserInputType.MouseButton2, true)
	frames(40, 1 / 30)
	check("nişan alınca görüş daraldı", camera.FieldOfView < 60, camera.FieldOfView)
	mouse(Enum.UserInputType.MouseButton2, false)
	frames(30, 1 / 30)
	check("nişan bırakınca görüş genişledi", camera.FieldOfView > 75, camera.FieldOfView)

	print("\nDolum ve silah değiştirme")
	Harness.clearOutbox()
	key(Enum.KeyCode.R, true)
	check("dolum isteği gönderildi", #Harness.sent("Reload") == 1)
	frames(90, 1 / 30)
	key(Enum.KeyCode.Two, true)
	frames(5)
	local equips = Harness.sent("Equip")
	check("2 tuşu yan silaha geçti", #equips >= 1 and equips[#equips][1] == "akrep")
	key(Enum.KeyCode.Three, true)
	frames(15)
	Harness.clearOutbox()
	mouse(Enum.UserInputType.MouseButton1, true)
	frames(3)
	mouse(Enum.UserInputType.MouseButton1, false)
	check("bıçakla vuruş isteği gönderildi", #Harness.sent("Melee") == 1)
	key(Enum.KeyCode.G, true)
	check("el bombası atıldı", #Harness.sent("Grenade") == 1)
	key(Enum.KeyCode.One, true)
	frames(10)

	print("\nKoşma ve eğilme")
	key(Enum.KeyCode.LeftShift, true)
	frames(10)
	check("koşarken hız arttı", character.Humanoid.WalkSpeed > 20, character.Humanoid.WalkSpeed)
	key(Enum.KeyCode.C, true)
	frames(3)
	check("koşarken eğilmek kaydırır", character.Humanoid.WalkSpeed > 30, character.Humanoid.WalkSpeed)
	key(Enum.KeyCode.LeftShift, false)
	frames(50)
	check("kayma bitince eğilmiş yürüyüş", character.Humanoid.WalkSpeed < 10, character.Humanoid.WalkSpeed)
	check("eğilince kamera alçaldı", character.Humanoid.CameraOffset.Y < 0)
	key(Enum.KeyCode.C, true)
	frames(5)
	check("tekrar C ile ayağa kalkar", character.Humanoid.WalkSpeed > 12, character.Humanoid.WalkSpeed)

	print("\nSunucu mesajları")
	serverSends("HitConfirm", { damage = 42, headshot = true, killed = false })
	serverSends("HitConfirm", { damage = 28, headshot = false, killed = true })
	serverSends("Damaged", Vector3.new(30, 3, 150), 20)
	serverSends("KillFeed", {
		killer = "Deneme",
		killerTeam = "Sahin",
		victim = "Kaya",
		victimTeam = "Ejder",
		weapon = "Bora-5",
		headshot = true,
	})
	serverSends("KillFeed", { victim = "Demir", victimTeam = "Sahin", weapon = "Kaza" })
	serverSends("Notify", { kind = "xp", amount = 100, text = "Düşman etkisiz" })
	serverSends("Notify", { kind = "rank", rank = 6, name = "Üstçavuş", unlocked = { "Engerek-50" } })
	serverSends(
		"Notify",
		{ kind = "capture", letter = "B", team = "Sahin", text = "Şahin Birliği B bölgesini aldı" }
	)
	serverSends("Notify", { kind = "tier", tier = 2, total = 12, weapon = "Bora-5" })
	serverSends("Notify", { kind = "round", title = "Takım Ölüm Maçı", text = "Başla" })
	serverSends("Notify", { kind = "announce", text = "Duyuru", team = "Ejder" })
	-- Bölge Hakimiyeti göstergeleri
	local points = roblox.Instance.new("Folder")
	points.Name = "Points"
	for _, letter in ipairs({ "A", "B", "C" }) do
		local model = roblox.Instance.new("Model")
		model.Name = "Point_" .. letter
		local zone = roblox.Instance.new("Part")
		zone.Name = "Zone"
		zone.CFrame = CFrame.new(0, 0, 150)
		zone.Position = Vector3.new(0, 0, 150)
		zone.Parent = model
		model.PrimaryPart = zone
		model:SetAttribute("Letter", letter)
		model:SetAttribute("Owner", letter == "A" and "Sahin" or "")
		model:SetAttribute("Progress", 0.5)
		model:SetAttribute("CapTeam", "Ejder")
		model:SetAttribute("Contested", letter == "C")
		model.Parent = points
	end
	points.Parent = workspace
	-- Takım arkadaşı ve düşman karakterleri (radar ve isim etiketi)
	local mate = Harness.rig("Demir")
	mate:SetAttribute("Team", "Sahin")
	mate:SetAttribute("EntityName", "Demir")
	mate:PivotTo(CFrame.new(10, 3, 140))
	mate.Parent = workspace
	local foe = Harness.rig("Kaya")
	foe:SetAttribute("Team", "Ejder")
	foe:SetAttribute("AimPitch", 0.3)
	foe:PivotTo(CFrame.new(-10, 3, 120))
	foe.Parent = workspace
	serverSends("ShotFx", foe, "bora", { Vector3.new(0, 3, 150) }, false)
	key(Enum.KeyCode.Tab, true)
	frames(30, 1 / 30)
	check("takım arkadaşının adı başında", mate.Head:FindFirstChild("TeamTag") ~= nil)
	check("düşmanın adı görünmez", foe.Head:FindFirstChild("TeamTag") == nil)
	check("skor tablosu açıldı", gui.Scoreboard.Enabled == true)
	local rowName = find(gui.Scoreboard, function(item)
		return item:IsA("TextLabel") and string.find(item.Text, "Kaya", 1, true) ~= nil
	end)
	check("skor tablosunda oyuncular listelendi", rowName ~= nil)
	key(Enum.KeyCode.Tab, false)
	check("bölge kutuları görünür", find(gui.Hud, function(item)
		return item.Name == "Points" and item.Visible
	end) ~= nil)
	check("öldürme akışında satır var", #find(gui.Hud, function(item)
		return item.Name == "KillFeed"
	end):GetChildren() > 1)

	print("\nDokunmatik düzen")
	Harness.signal(UserInputService, "LastInputTypeChanged"):Fire(Enum.UserInputType.Touch)
	task.wait(0.05)
	frames(3)
	check("dokunmatik düğmeler göründü", gui.TouchControls.Enabled == true)
	local fireButton = find(gui.TouchControls, function(item)
		return item:IsA("TextButton") and item.Text == "ATEŞ"
	end)
	Harness.clearOutbox()
	Harness.signal(fireButton, "InputBegan"):Fire({ UserInputType = Enum.UserInputType.Touch })
	task.wait(0.02)
	frames(10, 1 / 30)
	Harness.signal(fireButton, "InputEnded"):Fire({ UserInputType = Enum.UserInputType.Touch })
	task.wait(0.02)
	check("ATEŞ düğmesi ateş ettirdi", #Harness.sent("Fire") >= 1, #Harness.sent("Fire"))
	Harness.signal(UserInputService, "LastInputTypeChanged"):Fire(Enum.UserInputType.Keyboard)
	task.wait(0.05)

	print("\nÖlüm ve yeniden katılma")
	serverSends("Died", { killer = "Kaya", killerCharacter = foe, weapon = "Doğan-S", headshot = true, respawn = 0.3 })
	frames(5)
	check("ölüm şeridi göründü", gui.Menu.Enabled == true and find(gui.Menu, function(item)
		return item.Name == "Death"
	end).Visible == true)
	check("silah görünümü kaldırıldı", camera:FindFirstChild("Viewmodel") == nil)
	check("HUD kapandı", gui.Hud.Enabled == false)
	task.wait(0.4)
	-- Ölüm kamerası en az 2,5 saniye sürer
	for _ = 1, 30 do
		frame(0.1)
		task.wait(0.1)
	end
	check("ölümden sonra teçhizat ekranı açıldı", find(gui.Menu, function(item)
		return item.Name == "Root"
	end).Visible == true)

	print("\nTur sonu")
	State:SetAttribute("Phase", "Ended")
	State:SetAttribute("Winner", "Ejder")
	frames(3)
	local result = find(gui.Menu, function(item)
		return item.Name == "Result"
	end)
	check("tur sonucu gösterildi", result.Visible == true)
	local title = find(result, function(item)
		return item:IsA("TextLabel") and string.find(item.Text, "YENİLGİ", 1, true) ~= nil
	end)
	check("kaybeden takıma YENİLGİ yazıldı", title ~= nil)
	State:SetAttribute("Mode", "gg")
	State:SetAttribute("Phase", "Intermission")
	frames(3)
	check("Silah Yarışı'nda teçhizat notu", find(gui.Menu, function(item)
		return item.Name == "GunGameNote"
	end).Visible == true)
end)

if not ok then
	print("TEST DURDU: " .. tostring(problem))
	Harness.failed += 1
end
print("\nUyarılar:")
for _, line in ipairs(Harness.warnings) do
	print("  " .. line)
end
process.exit(Harness.finish() and 0 or 1)
