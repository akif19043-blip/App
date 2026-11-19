-- Test düzeneği: Rojo'nun derlediği yer dosyasını Lune ile açar ve oyunun
-- kendi kodunu, Roblox motorunun eksik parçalarını taklit ederek çalıştırır.
--
-- Lune, Roblox nesnelerini (Instance) ve veri türlerini gerçekten kurar ve
-- her özellik adını/türünü Roblox'un API listesine göre denetler; ama fizik,
-- olaylar (Connect) ve motor servisleri yoktur. Burada olanlar:
--   * olaylar (PlayerAdded, OnServerEvent, Died ...) elle tetiklenen sinyaller
--   * RemoteEvent'ler: sunucudan istemciye giden her mesaj kaydedilir
--   * Model:PivotTo, WaitForChild, LoadCharacter, DataStore, Pathfinding taklitleri
--   * parçaların Position özelliği CFrame'den eşitlenir (fizik yerine)

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local task = require("@lune/task")

local Harness = {}

local Instance = roblox.Instance
local Vector3 = roblox.Vector3
local CFrame = roblox.CFrame
local Enum = roblox.Enum

Harness.roblox = roblox
Harness.warnings = {}
Harness.errors = {}

-- Sinyaller ----------------------------------------------------------------

local function newSignal(name)
	local signal = { name = name, handlers = {} }
	function signal:Connect(fn)
		local entry = { fn = fn, connected = true }
		table.insert(self.handlers, entry)
		return {
			Connected = true,
			Disconnect = function()
				entry.connected = false
			end,
		}
	end
	function signal:Once(fn)
		local connection
		connection = self:Connect(function(...)
			connection.Disconnect()
			fn(...)
		end)
		return connection
	end
	function signal:Wait()
		local result
		local done = false
		self:Once(function(...)
			result = table.pack(...)
			done = true
		end)
		local waited = 0
		while not done do
			waited += task.wait(0.01)
			if waited > 10 then
				error("Sinyal beklenirken zaman aşımı: " .. name)
			end
		end
		return table.unpack(result, 1, result.n)
	end
	function signal:Fire(...)
		for _, entry in ipairs(table.clone(self.handlers)) do
			if entry.connected then
				local args = table.pack(...)
				task.spawn(function()
					local ok, err = pcall(entry.fn, table.unpack(args, 1, args.n))
					if not ok then
						table.insert(Harness.errors, string.format("[%s] %s", name, tostring(err)))
						print("HATA (" .. name .. "): " .. tostring(err))
					end
				end)
			end
		end
	end
	return signal
end

local signals = {}

function Harness.signal(instance, name)
	local byName = signals[instance]
	if not byName then
		byName = {}
		signals[instance] = byName
	end
	local signal = byName[name]
	if not signal then
		signal = newSignal(name)
		byName[name] = signal
	end
	return signal
end

-- Olaylar yalnızca ait oldukları sınıflara tanımlanır (aksi hâlde aynı adlı
-- çocukları, ör. Remotes.Died, gölgelerdi)
local EVENTS = {
	Players = { "PlayerAdded", "PlayerRemoving" },
	RemoteEvent = { "OnServerEvent", "OnClientEvent" },
	UnreliableRemoteEvent = { "OnServerEvent", "OnClientEvent" },
	Humanoid = { "Died", "Running" },
	RunService = { "Heartbeat", "RenderStepped", "Stepped" },
	UserInputService = { "InputBegan", "InputEnded", "InputChanged", "LastInputTypeChanged" },
	GuiObject = { "InputBegan", "InputEnded", "InputChanged", "MouseEnter", "MouseLeave" },
	GuiButton = { "Activated" },
	Sound = { "Ended" },
	Player = { "CharacterAdded", "CharacterRemoving" },
	BasePart = { "Touched" },
	Instance = { "ChildAdded", "ChildRemoved", "AncestryChanged", "Changed" },
}
for className, names in pairs(EVENTS) do
	for _, name in ipairs(names) do
		roblox.implementProperty(className, name, function(self)
			return Harness.signal(self, name)
		end)
	end
end

-- Uzak olaylar ---------------------------------------------------------------

Harness.outbox = {} -- { remote, to, args }

local function record(remote, to, ...)
	table.insert(Harness.outbox, { remote = remote.Name, to = to, args = table.pack(...) })
end

roblox.implementMethod("RemoteEvent", "FireClient", function(self, player, ...)
	record(self, player, ...)
end)
roblox.implementMethod("RemoteEvent", "FireAllClients", function(self, ...)
	record(self, "all", ...)
end)
roblox.implementMethod("RemoteEvent", "FireServer", function(self, ...)
	record(self, "server", ...)
end)
roblox.implementMethod("UnreliableRemoteEvent", "FireClient", function(self, player, ...)
	record(self, player, ...)
end)
roblox.implementMethod("UnreliableRemoteEvent", "FireAllClients", function(self, ...)
	record(self, "all", ...)
end)
roblox.implementMethod("UnreliableRemoteEvent", "FireServer", function(self, ...)
	record(self, "server", ...)
end)

function Harness.sent(remoteName, to)
	local list = {}
	for _, item in ipairs(Harness.outbox) do
		if item.remote == remoteName and (to == nil or item.to == to or item.to == "all") then
			table.insert(list, item.args)
		end
	end
	return list
end

function Harness.clearOutbox()
	table.clear(Harness.outbox)
end

-- Genel yöntemler -------------------------------------------------------------

roblox.implementMethod("Instance", "WaitForChild", function(self, name, timeout)
	local waited = 0
	while true do
		local child = self:FindFirstChild(name)
		if child then
			return child
		end
		if timeout and waited >= timeout then
			return nil
		end
		if waited > 5 then
			error(string.format("WaitForChild sonsuza kadar bekleyecekti: %s.%s", self:GetFullName(), name))
		end
		waited += task.wait(0.02)
	end
end)

roblox.implementMethod("Instance", "GetPropertyChangedSignal", function(self, property)
	return Harness.signal(self, "Changed:" .. property)
end)

roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(self, attribute)
	return Harness.signal(self, "Attr:" .. attribute)
end)

local function baseParts(model)
	local list = {}
	if model:IsA("BasePart") then
		table.insert(list, model)
	end
	for _, item in ipairs(model:GetDescendants()) do
		if item:IsA("BasePart") then
			table.insert(list, item)
		end
	end
	return list
end

local function pivotOf(model)
	local primary = model.PrimaryPart
	if primary then
		return primary.CFrame
	end
	local first = baseParts(model)[1]
	return first and first.CFrame or CFrame.new()
end

roblox.implementMethod("Model", "GetPivot", pivotOf)

roblox.implementMethod("Model", "PivotTo", function(self, target)
	local delta = target * pivotOf(self):Inverse()
	for _, part in ipairs(baseParts(self)) do
		part.CFrame = delta * part.CFrame
		part.Position = part.CFrame.Position
	end
end)

roblox.implementMethod("Model", "ScaleTo", function(self, scale)
	local pivot = pivotOf(self)
	for _, part in ipairs(baseParts(self)) do
		local relative = pivot:ToObjectSpace(part.CFrame)
		part.Size = part.Size * scale
		part.CFrame = pivot * (relative - relative.Position + relative.Position * scale)
		part.Position = part.CFrame.Position
	end
	for _, item in ipairs(self:GetDescendants()) do
		if item:IsA("Attachment") then
			item.Position = item.Position * scale
		end
	end
end)

roblox.implementMethod("BasePart", "SetNetworkOwner", function() end)

roblox.implementMethod("Humanoid", "MoveTo", function(self, position)
	self:SetAttribute("TestMoveTo", position)
end)

roblox.implementMethod("Humanoid", "ChangeState", function(self, state)
	self:SetAttribute("TestState", state.Name)
end)

roblox.implementMethod("Animator", "LoadAnimation", function(_, animation)
	return {
		Animation = animation,
		Looped = false,
		Play = function() end,
		Stop = function() end,
	}
end)

roblox.implementMethod("ParticleEmitter", "Emit", function() end)
roblox.implementMethod("Sound", "Play", function() end)
roblox.implementMethod("Sound", "Stop", function() end)

-- Parçaların Position'ı fizik yerine CFrame'den eşitlenir
function Harness.syncPositions(root)
	for _, part in ipairs(baseParts(root)) do
		part.Position = part.CFrame.Position
	end
end

-- Karakter ------------------------------------------------------------------

local function part(model, name, size, offset)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = offset
	p.Position = offset.Position
	p.AssemblyLinearVelocity = Vector3.zero
	p.Parent = model
	return p
end

local function motor(name, part0, part1, c0)
	local m = Instance.new("Motor6D")
	m.Name = name
	m.Part0 = part0
	m.Part1 = part1
	m.C0 = c0
	m.C1 = CFrame.new()
	m.Parent = part1
	return m
end

-- R15'e benzeyen basit bir gövde (uzuv adları ve eklemler gerçeğiyle aynı)
function Harness.rig(name)
	local model = Instance.new("Model")
	model.Name = name or "Rig"
	local root = part(model, "HumanoidRootPart", Vector3.new(2, 2, 1), CFrame.new(0, 0, 0))
	local lower = part(model, "LowerTorso", Vector3.new(2, 0.4, 1), CFrame.new(0, -0.2, 0))
	local upper = part(model, "UpperTorso", Vector3.new(2, 1.6, 1), CFrame.new(0, 0.8, 0))
	local head = part(model, "Head", Vector3.new(1.2, 1.2, 1.2), CFrame.new(0, 2.2, 0))
	local rightArm = part(model, "RightUpperArm", Vector3.new(1, 1.2, 1), CFrame.new(1.5, 1, 0))
	local leftArm = part(model, "LeftUpperArm", Vector3.new(1, 1.2, 1), CFrame.new(-1.5, 1, 0))
	part(model, "RightHand", Vector3.new(0.8, 0.4, 0.8), CFrame.new(1.5, -0.4, 0))
	part(model, "LeftHand", Vector3.new(0.8, 0.4, 0.8), CFrame.new(-1.5, -0.4, 0))
	part(model, "RightUpperLeg", Vector3.new(1, 1.4, 1), CFrame.new(0.5, -1.2, 0))
	part(model, "LeftUpperLeg", Vector3.new(1, 1.4, 1), CFrame.new(-0.5, -1.2, 0))
	motor("Root", root, lower, CFrame.new())
	motor("Waist", lower, upper, CFrame.new(0, 0.2, 0))
	motor("Neck", upper, head, CFrame.new(0, 0.8, 0))
	motor("RightShoulder", upper, rightArm, CFrame.new(1, 0.5, 0))
	motor("LeftShoulder", upper, leftArm, CFrame.new(-1, 0.5, 0))
	local humanoid = Instance.new("Humanoid")
	humanoid.MaxHealth = 100
	humanoid.Health = 100
	humanoid.WalkSpeed = 16
	humanoid.HipHeight = 2
	humanoid.MoveDirection = Vector3.zero
	humanoid.FloorMaterial = Enum.Material.Plastic
	humanoid.CameraOffset = Vector3.zero
	humanoid.Parent = model
	model.PrimaryPart = root
	return model
end

roblox.implementMethod("Players", "CreateHumanoidModelFromDescriptionAsync", function(_, _, _)
	return Harness.rig("Bot")
end)

roblox.implementMethod("Players", "GetPlayers", function(self)
	local list = {}
	for _, child in ipairs(self:GetChildren()) do
		if child:IsA("Player") then
			table.insert(list, child)
		end
	end
	return list
end)

roblox.implementMethod("Player", "LoadCharacter", function(self)
	local old = self.Character
	if old then
		old:Destroy()
	end
	local character = Harness.rig(self.Name)
	character:PivotTo(CFrame.new(0, 100, 0))
	character.Parent = Harness.game:GetService("Workspace")
	self.Character = character
	Harness.signal(self, "CharacterAdded"):Fire(character)
end)

-- Servis taklitleri ---------------------------------------------------------

Harness.datastore = {}

roblox.implementMethod("DataStoreService", "GetDataStore", function(_, name)
	local data = Harness.datastore
	return {
		Name = name,
		GetAsync = function(_, key)
			return data[key]
		end,
		SetAsync = function(_, key, value)
			data[key] = value
		end,
	}
end)

roblox.implementMethod("PathfindingService", "CreatePath", function()
	return {
		Status = Enum.PathStatus.NoPath,
		ComputeAsync = function() end,
		GetWaypoints = function()
			return {}
		end,
	}
end)

roblox.implementMethod("Debris", "AddItem", function(_, item, seconds)
	task.delay(seconds or 10, function()
		pcall(function()
			item:Destroy()
		end)
	end)
end)

roblox.implementMethod("WorldRoot", "Raycast", function()
	return nil
end)

-- Arazi: doldurma çağrıları kaydedilir (önizleme bunları çizer)
Harness.terrainFills = {}
Harness.terrainColors = {}
roblox.implementMethod("Terrain", "FillBlock", function(_, cframe, size, material)
	table.insert(Harness.terrainFills, { kind = "block", cframe = cframe, size = size, material = material.Name })
end)
roblox.implementMethod("Terrain", "FillBall", function(_, center, radius, material)
	table.insert(Harness.terrainFills, { kind = "ball", center = center, radius = radius, material = material.Name })
end)
roblox.implementMethod("Terrain", "FillCylinder", function(_, cframe, height, radius, material)
	table.insert(
		Harness.terrainFills,
		{ kind = "cylinder", cframe = cframe, height = height, radius = radius, material = material.Name }
	)
end)
roblox.implementMethod("Terrain", "FillWedge", function(_, cframe, size, material)
	table.insert(Harness.terrainFills, { kind = "wedge", cframe = cframe, size = size, material = material.Name })
end)
roblox.implementMethod("Terrain", "SetMaterialColor", function(_, material, color)
	Harness.terrainColors[material.Name] = color
end)

roblox.implementMethod("DataModel", "BindToClose", function(self, fn)
	Harness.closeHandlers = Harness.closeHandlers or {}
	table.insert(Harness.closeHandlers, fn)
end)

Harness.renderSteps = {}
roblox.implementMethod("RunService", "BindToRenderStep", function(_, name, priority, fn)
	Harness.renderSteps[name] = { priority = priority, fn = fn }
end)

roblox.implementMethod("StarterGui", "SetCoreGuiEnabled", function() end)
roblox.implementMethod("StarterGui", "SetCore", function() end)
roblox.implementMethod("UserInputService", "GetMouseDelta", function()
	return roblox.Vector2.zero
end)

-- Roblox'ta olup Lune'da olmayan veri türleri
local function newRandom(seed)
	local state = (seed or os.clock() * 1e6) % 2147483647
	if state <= 0 then
		state += 2147483646
	end
	local function next01()
		state = (state * 16807) % 2147483647
		return state / 2147483647
	end
	return {
		NextNumber = function(_, min, max)
			min = min or 0
			max = max or 1
			return min + (max - min) * next01()
		end,
		NextInteger = function(_, min, max)
			return math.floor(min + (max - min + 1) * next01())
		end,
	}
end

local function newRaycastParams()
	return { FilterType = Enum.RaycastFilterType.Exclude, FilterDescendantsInstances = {}, IgnoreWater = false }
end

-- Lune'da varsayılan değeri olmayan özellikler oluşturulurken doldurulur
local function newInstance(className, parent)
	local instance = Instance.new(className)
	if instance:IsA("BasePart") then
		instance.AssemblyLinearVelocity = Vector3.zero
		instance.Position = Vector3.zero
	elseif className == "Attachment" then
		instance.WorldPosition = Vector3.zero
		instance.WorldCFrame = CFrame.new()
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

-- Modül yükleyici -------------------------------------------------------------

local cache = {}

function Harness.environment(script)
	local env = {
		game = Harness.game,
		workspace = Harness.game:GetService("Workspace"),
		script = script,
		Instance = { new = newInstance },
		Enum = Enum,
		Vector3 = Vector3,
		Vector2 = roblox.Vector2,
		CFrame = CFrame,
		Color3 = roblox.Color3,
		UDim = roblox.UDim,
		UDim2 = roblox.UDim2,
		BrickColor = roblox.BrickColor,
		NumberSequence = roblox.NumberSequence,
		NumberSequenceKeypoint = roblox.NumberSequenceKeypoint,
		ColorSequence = roblox.ColorSequence,
		ColorSequenceKeypoint = roblox.ColorSequenceKeypoint,
		NumberRange = roblox.NumberRange,
		PhysicalProperties = roblox.PhysicalProperties,
		Rect = roblox.Rect,
		Font = roblox.Font,
		Ray = roblox.Ray,
		Random = { new = newRandom },
		RaycastParams = { new = newRaycastParams },
		task = task,
		typeof = typeof,
		warn = function(...)
			local parts = {}
			for index = 1, select("#", ...) do
				table.insert(parts, tostring(select(index, ...)))
			end
			table.insert(Harness.warnings, table.concat(parts, " "))
		end,
		require = Harness.require,
	}
	return env
end

function Harness.require(module)
	if typeof(module) ~= "Instance" then
		error("require için ModuleScript bekleniyordu: " .. tostring(module))
	end
	local cached = cache[module]
	if cached then
		return cached.value
	end
	local chunk = luau.load(module.Source, {
		debugName = module:GetFullName(),
		environment = Harness.environment(module),
	})
	local value = chunk()
	cache[module] = { value = value }
	return value
end

-- Bir Script/LocalScript'i kendi iş parçacığında çalıştırır
function Harness.run(scriptInstance)
	local chunk = luau.load(scriptInstance.Source, {
		debugName = scriptInstance:GetFullName(),
		environment = Harness.environment(scriptInstance),
	})
	local ok, err
	task.spawn(function()
		ok, err = pcall(chunk)
		if not ok then
			table.insert(Harness.errors, scriptInstance:GetFullName() .. ": " .. tostring(err))
			print("HATA (" .. scriptInstance:GetFullName() .. "): " .. tostring(err))
		end
	end)
end

function Harness.load(placePath)
	local game = roblox.deserializePlace(fs.readFile(placePath))
	Harness.game = game
	local workspace = game:GetService("Workspace")
	if not workspace:FindFirstChildOfClass("Terrain") then
		Instance.new("Terrain").Parent = workspace
	end
	local camera = Instance.new("Camera")
	camera.Name = "Camera"
	camera.CFrame = CFrame.new(0, 10, 0)
	camera.FieldOfView = 70
	camera.ViewportSize = roblox.Vector2.new(1280, 720)
	camera.Parent = workspace
	workspace.CurrentCamera = camera
	return game
end

function Harness.addPlayer(name, userId)
	local player = Instance.new("Player")
	player.Name = name
	player.DisplayName = name
	player.UserId = userId
	player.Parent = Harness.game:GetService("Players")
	return player
end

function Harness.wait(seconds)
	task.wait(seconds)
end

-- Bir koşul gerçekleşene kadar bekle (en fazla "limit" saniye)
function Harness.waitFor(description, limit, predicate)
	local waited = 0
	while not predicate() do
		if waited > limit then
			error("Beklenen olmadı: " .. description)
		end
		waited += task.wait(0.05)
	end
	return waited
end

-- Basit test çatısı -----------------------------------------------------------

Harness.passed = 0
Harness.failed = 0

function Harness.check(name, condition, detail)
	if condition then
		Harness.passed += 1
		print("  ✓ " .. name)
	else
		Harness.failed += 1
		print("  ✗ " .. name .. (detail and ("  (" .. tostring(detail) .. ")") or ""))
	end
end

function Harness.finish()
	for _, err in ipairs(Harness.errors) do
		Harness.failed += 1
		print("  ✗ çalışma hatası: " .. err)
	end
	print(string.format("\n%d geçti, %d kaldı", Harness.passed, Harness.failed))
	return Harness.failed == 0
end

return Harness
