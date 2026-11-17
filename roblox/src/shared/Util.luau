local Util = {}

-- Bir parçadan, ona sahip olan karakter modelini bulur (şapka, yelek ya da
-- eldeki silah modelinin içindeki parçalar için de çalışır).
function Util.characterFromPart(part)
	local current = part
	while current and current ~= workspace do
		if current:IsA("Model") and current:FindFirstChildOfClass("Humanoid") then
			return current
		end
		current = current.Parent
	end
	return nil
end

function Util.flat(v)
	return Vector3.new(v.X, 0, v.Z)
end

function Util.formatTime(seconds)
	seconds = math.max(0, math.floor(seconds))
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

function Util.lerp(a, b, t)
	return a + (b - a) * t
end

-- Kare hızından bağımsız yumuşatma katsayısı
function Util.smooth(rate, dt)
	return 1 - math.exp(-rate * dt)
end

return Util
