-- Girdiler: klavye ve fare, oyun kolu, dokunmatik düğmeler. Her eylem Main'in
-- verdiği işleyiciye gider; burada oyun mantığı yok.
--
-- Klavye:  Sol tık ateş · Sağ tık nişan · R doldur · 1/2/3 ya da tekerlek silah
--          Q önceki silah · G el bombası · V/F bıçak · Shift koş · C/Ctrl eğil
--          Tab skor tablosu · Enter savaşa katıl
-- Oyun kolu: RT ateş · LT nişan · X doldur · Y silah · RB bomba · R3 bıçak
--            L3 koş · B eğil · Select skor

local UserInputService = game:GetService("UserInputService")

local Ui = require(script.Parent.Ui)

local Controls = {}

local C = Ui.Colors
local handlers = {}
local touchGui
local touchEnabled = false

local KEY_ACTIONS = {
	[Enum.KeyCode.R] = "reload",
	[Enum.KeyCode.One] = "equip1",
	[Enum.KeyCode.Two] = "equip2",
	[Enum.KeyCode.Three] = "equip3",
	[Enum.KeyCode.Q] = "swapLast",
	[Enum.KeyCode.G] = "grenade",
	[Enum.KeyCode.V] = "melee",
	[Enum.KeyCode.F] = "melee",
	[Enum.KeyCode.C] = "crouch",
	[Enum.KeyCode.LeftControl] = "crouch",
	[Enum.KeyCode.Return] = "deploy",
	[Enum.KeyCode.KeypadEnter] = "deploy",
	[Enum.KeyCode.ButtonX] = "reload",
	[Enum.KeyCode.ButtonY] = "cycle",
	[Enum.KeyCode.ButtonR1] = "grenade",
	[Enum.KeyCode.ButtonR3] = "melee",
	[Enum.KeyCode.ButtonB] = "crouch",
	[Enum.KeyCode.ButtonL3] = "toggleSprint",
	[Enum.KeyCode.ButtonSelect] = "toggleScoreboard",
	[Enum.KeyCode.ButtonStart] = "deploy",
}

local function call(name, ...)
	local fn = handlers[name]
	if fn then
		fn(...)
	end
end

local function trigger(action)
	if action == "equip1" then
		call("equip", 1)
	elseif action == "equip2" then
		call("equip", 2)
	elseif action == "equip3" then
		call("equip", 3)
	elseif action == "cycle" then
		call("cycle", 1)
	else
		call(action)
	end
end

local function onBegan(input, processed)
	local kind = input.UserInputType
	if kind == Enum.UserInputType.MouseButton1 then
		if not processed then
			call("fire", true)
		end
		return
	elseif kind == Enum.UserInputType.MouseButton2 then
		if not processed then
			call("aim", true)
		end
		return
	end
	local key = input.KeyCode
	if key == Enum.KeyCode.ButtonR2 then
		call("fire", true)
		return
	elseif key == Enum.KeyCode.ButtonL2 then
		call("aim", true)
		return
	end
	if processed then
		return
	end
	if key == Enum.KeyCode.LeftShift then
		call("sprint", true)
	elseif key == Enum.KeyCode.Tab then
		call("scoreboard", true)
	elseif KEY_ACTIONS[key] then
		trigger(KEY_ACTIONS[key])
	end
end

local function onEnded(input)
	local kind = input.UserInputType
	local key = input.KeyCode
	if kind == Enum.UserInputType.MouseButton1 or key == Enum.KeyCode.ButtonR2 then
		call("fire", false)
	elseif kind == Enum.UserInputType.MouseButton2 or key == Enum.KeyCode.ButtonL2 then
		call("aim", false)
	elseif key == Enum.KeyCode.LeftShift then
		call("sprint", false)
	elseif key == Enum.KeyCode.Tab then
		call("scoreboard", false)
	end
end

local function onChanged(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.MouseWheel then
		call("cycle", input.Position.Z > 0 and -1 or 1)
	end
end

-- Dokunmatik düğme. hold = true ise basılı tutulduğu sürece etkin.
local function touchButton(parent, text, size, position, onPress, onRelease)
	local b = Ui.make("TextButton", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = position,
		Size = UDim2.fromOffset(size, size),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.45,
		AutoButtonColor = false,
		Font = Ui.Font,
		Text = text,
		TextColor3 = C.text,
		TextSize = math.floor(size * 0.2),
		TextWrapped = true,
		Parent = parent,
	}, { Ui.round(), Ui.stroke(C.text, 2, 0.55) })
	b.InputBegan:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.Touch
			or input.UserInputType == Enum.UserInputType.MouseButton1
		then
			b.BackgroundTransparency = 0.2
			onPress()
		end
	end)
	b.InputEnded:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.Touch
			or input.UserInputType == Enum.UserInputType.MouseButton1
		then
			b.BackgroundTransparency = 0.45
			if onRelease then
				onRelease()
			end
		end
	end)
	return b
end

function Controls.buildTouch(playerGui, camera)
	touchGui = Ui.make("ScreenGui", {
		Name = "TouchControls",
		IgnoreGuiInset = true,
		ResetOnSpawn = false,
		DisplayOrder = 2,
		Enabled = false,
		Parent = playerGui,
	})
	local canvas = Ui.canvas(touchGui, camera)
	local refs = {}
	refs.fire = touchButton(canvas, "ATEŞ", 96, UDim2.new(1, -205, 1, -150), function()
		call("fire", true)
	end, function()
		call("fire", false)
	end)
	refs.fireLeft = touchButton(canvas, "ATEŞ", 72, UDim2.new(0, 70, 0.48, 0), function()
		call("fire", true)
	end, function()
		call("fire", false)
	end)
	refs.aim = touchButton(canvas, "NİŞAN", 70, UDim2.new(1, -90, 1, -245), function()
		call("toggleAim")
	end)
	refs.reload = touchButton(canvas, "DOLDUR", 56, UDim2.new(1, -310, 1, -96), function()
		call("reload")
	end)
	refs.swap = touchButton(canvas, "SİLAH", 56, UDim2.new(1, -60, 1, -340), function()
		call("cycle", 1)
	end)
	refs.grenade = touchButton(canvas, "BOMBA", 52, UDim2.new(1, -175, 1, -270), function()
		call("grenade")
	end)
	refs.melee = touchButton(canvas, "BIÇAK", 52, UDim2.new(1, -275, 1, -215), function()
		call("melee")
	end)
	refs.crouch = touchButton(canvas, "EĞİL", 56, UDim2.new(1, -330, 1, -160), function()
		call("crouch")
	end)
	refs.sprint = touchButton(canvas, "KOŞ", 62, UDim2.new(0, 190, 1, -230), function()
		call("toggleSprint")
	end)
	refs.score = touchButton(canvas, "SKOR", 46, UDim2.new(1, -46, 0, 120), function()
		call("toggleScoreboard")
	end)
	return touchGui, refs
end

function Controls.setTouchVisible(visible)
	if touchGui then
		touchGui.Enabled = visible and touchEnabled
	end
end

function Controls.isTouch()
	return touchEnabled
end

function Controls.init(newHandlers)
	handlers = newHandlers
	touchEnabled = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	UserInputService.InputBegan:Connect(onBegan)
	UserInputService.InputEnded:Connect(onEnded)
	UserInputService.InputChanged:Connect(onChanged)
	UserInputService.LastInputTypeChanged:Connect(function(kind)
		if kind == Enum.UserInputType.Touch then
			touchEnabled = true
		elseif kind == Enum.UserInputType.Keyboard or kind == Enum.UserInputType.MouseMovement then
			touchEnabled = false
		end
		if handlers.inputModeChanged then
			handlers.inputModeChanged(touchEnabled)
		end
	end)
end

return Controls
